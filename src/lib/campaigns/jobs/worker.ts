/**
 * Worker, driven by the cron route /api/cron/campaigns (every 5 minutes).
 *
 * Jobs: claimed with FOR UPDATE SKIP LOCKED, each handled in its own
 * transaction. A failure is retried with exponential backoff
 * (2^attempts minutes, capped at 6h) up to max_attempts, then marked dead
 * (the failure queue, visible to managers, who can retry it). A job stuck in
 * "running" for 15 minutes (crashed invocation) is retried as well.
 *
 * Notifications: claimed and marked "sending" in a short transaction, sent
 * outside any transaction, then the outcome is recorded. Before sending, the
 * message's relevance is re-checked and it is cancelled if no longer needed.
 * A timeout becomes "uncertain" and is never resent automatically.
 */
import type { Pool } from 'pg'
import { withTx } from '../db'
import type { Deps } from '../context'
import { issueToken } from '../portal/access'
import { issueLoginToken, type LoginPurpose } from '../auth/accounts'
import { JOB_HANDLERS, stillRelevant, type JobRow } from './automation'
import type { Relevance } from './queue'
import { TransportError } from '../messaging/transport'
import { PRODUCT } from '@/lib/campaigns/brand'

export const STALE_RUNNING_MINUTES = 15
export const PORTAL_EMAIL_LINK_HOURS = 72

export function backoffMs(attempts: number): number {
  return Math.min(2 ** attempts * 60_000, 6 * 3_600_000)
}

export interface WorkerReport {
  jobs: { done: number; skipped: number; failed: number; dead: number }
  notifications: { sent: number; devNotSent: number; failed: number; dead: number; uncertain: number; cancelled: number }
}

export async function runJobs(pool: Pool, now: Date, limit = 50): Promise<WorkerReport['jobs']> {
  const report = { done: 0, skipped: 0, failed: 0, dead: 0 }
  const claimed = await withTx(async (tx) => {
    const { rows } = await tx.query<JobRow & { attempts: number; max_attempts: number }>(
      `update cm_jobs set status = 'running', locked_at = $1, attempts = attempts + 1
        where id in (
          select id from cm_jobs
           where (status in ('pending','failed') and run_after <= $1)
              or (status = 'running' and locked_at < $1::timestamptz - interval '${STALE_RUNNING_MINUTES} minutes')
           order by run_after
           limit $2
           for update skip locked)
        returning id, kind, campaign_id, subject_type, subject_id, payload, correlation_id, attempts, max_attempts`,
      [now, limit],
    )
    return rows
  }, pool)

  for (const job of claimed) {
    const handler = JOB_HANDLERS[job.kind]
    try {
      if (!handler) throw new Error(`no handler for ${job.kind}`)
      const out = await withTx((tx) => handler(tx, job, now), pool)
      await pool.query(`update cm_jobs set status = $2, result = $3, locked_at = null, last_error = null where id = $1`,
        [job.id, out.outcome, out.result])
      report[out.outcome]++
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500)
      const dead = job.attempts >= job.max_attempts
      await pool.query(
        `update cm_jobs set status = $2, last_error = $3, locked_at = null, run_after = $4 where id = $1`,
        [job.id, dead ? 'dead' : 'failed', msg, new Date(now.getTime() + backoffMs(job.attempts))],
      )
      report[dead ? 'dead' : 'failed']++
      console.error(`[campaigns/worker] job ${job.kind} ${job.id} attempt ${job.attempts} failed`)
    }
  }
  return report
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function renderEmail(body: string, link: string | null): { text: string; html: string } {
  const text = link ? `${body}\n\n${link}` : body
  const html =
    `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6">` +
    escapeHtml(body).replace(/\n/g, '<br>') +
    (link ? `<p><a href="${escapeHtml(link)}" rel="noreferrer">מעבר למערכת</a></p>` : '') +
    `<p style="color:#666;font-size:12px">הודעה תפעולית מ-${PRODUCT.name}.</p></div>`
  return { text, html }
}

export async function dispatchNotifications(pool: Pool, deps: Deps, now: Date, limit = 50): Promise<WorkerReport['notifications']> {
  const report = { sent: 0, devNotSent: 0, failed: 0, dead: 0, uncertain: 0, cancelled: 0 }
  const claimed = await withTx(async (tx) => {
    const { rows } = await tx.query<{
      id: string; campaign_id: string | null; audience: string; recipient_grant_id: string | null; to_address: string
      subject: string; body_text: string; link_path: string | null; relevance: Relevance | null
      idempotency_key: string; attempts: number; max_attempts: number
      recipient_user_id: string | null; login_link_purpose: LoginPurpose | null; organization_id: string | null; sender_name: string | null
    }>(
      `update cm_notifications set status = 'sending', attempts = attempts + 1
        where id in (select id from cm_notifications where status in ('pending','failed') and next_attempt_at <= $1
                      order by next_attempt_at limit $2 for update skip locked)
        returning id, campaign_id, audience, recipient_grant_id, to_address, subject, body_text, link_path, relevance,
                  idempotency_key, attempts, max_attempts, recipient_user_id, login_link_purpose,
                  coalesce(organization_id, (select c.organization_id from cm_campaigns c where c.id = cm_notifications.campaign_id)) as organization_id,
                  (select coalesce(o.settings->>'sender_name', o.name) from cm_organizations o
                    where o.id = coalesce(cm_notifications.organization_id, (select c.organization_id from cm_campaigns c where c.id = cm_notifications.campaign_id))) as sender_name`,
      [now, limit],
    )
    return rows
  }, pool)

  for (const n of claimed) {
    if (!(await stillRelevant(pool, n.relevance, n.campaign_id))) {
      await pool.query(`update cm_notifications set status = 'cancelled', last_error = 'no longer needed' where id = $1`, [n.id])
      report.cancelled++
      continue
    }
    let link: string | null = null
    try {
      if (n.login_link_purpose && n.recipient_user_id) {
        // Staff sign-in / invitation link, minted now; only its hash is stored.
        const token = await issueLoginToken(pool, n.recipient_user_id, n.login_link_purpose, now, n.organization_id)
        link = `${deps.baseUrl}/campaigns/enter#t=${token}`
      } else if (n.link_path && n.recipient_grant_id) {
        // Fresh single-use portal login link per send; only its hash is stored.
        const { token } = await issueToken(pool, n.recipient_grant_id, 'login', now, null, PORTAL_EMAIL_LINK_HOURS * 3_600_000)
        link = `${deps.baseUrl}/portal/enter#t=${token}&next=${encodeURIComponent(n.link_path)}`
      } else if (n.link_path) {
        link = `${deps.baseUrl}${n.link_path}`
      }
      const { text, html } = renderEmail(n.body_text, link)
      const res = await deps.transport.send({ to: n.to_address, subject: n.subject, text, html, idempotencyKey: n.idempotency_key, fromName: n.sender_name ?? undefined })
      if (res.outcome === 'sent') {
        await pool.query(`update cm_notifications set status = 'sent', provider = $2, provider_message_id = $3, sent_at = $4, last_error = null where id = $1`,
          [n.id, res.provider, res.providerMessageId, now])
        report.sent++
      } else {
        await pool.query(`update cm_notifications set status = 'dev_not_sent', provider = 'dev', last_error = 'לא נשלחה — סביבת פיתוח' where id = $1`, [n.id])
        report.devNotSent++
      }
    } catch (e) {
      const te = e instanceof TransportError ? e : new TransportError(e instanceof Error ? e.message : String(e), true)
      const msg = te.message.slice(0, 500)
      if (te.uncertain) {
        await pool.query(`update cm_notifications set status = 'uncertain', last_error = $2 where id = $1`, [n.id, msg])
        report.uncertain++
      } else if (!te.retryable || n.attempts >= n.max_attempts) {
        await pool.query(`update cm_notifications set status = 'dead', last_error = $2 where id = $1`, [n.id, msg])
        report.dead++
      } else {
        await pool.query(`update cm_notifications set status = 'failed', last_error = $2, next_attempt_at = $3 where id = $1`,
          [n.id, msg, new Date(now.getTime() + backoffMs(n.attempts))])
        report.failed++
      }
    }
  }
  return report
}

export async function runWorker(pool: Pool, deps: Deps, now = new Date()): Promise<WorkerReport> {
  const jobs = await runJobs(pool, now)
  const notifications = await dispatchNotifications(pool, deps, now)
  return { jobs, notifications }
}
