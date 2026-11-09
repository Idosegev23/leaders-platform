/**
 * Local database helper for the campaigns module. Refuses to touch anything
 * that is not on localhost.
 *
 *   npx tsx scripts/campaigns/db.ts reset            # drop + recreate DB, shim, every migration
 *   npx tsx scripts/campaigns/db.ts migrate          # apply only the campaigns migration (re-run = idempotency check)
 *
 * Connection: CAMPAIGNS_DATABASE_URL (default postgres://postgres@localhost:54329/leaders_dev).
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { Client } from 'pg'

// Needs extensions that a plain Postgres does not ship (pg_net). Unrelated to
// the campaigns module; skipped locally only.
const SKIP_LOCALLY = new Set(['20260423_lead_auto_clickup_trigger.sql'])
// Pre-existing naming bug: some files sort before the same-day file that creates
// the tables they alter (research_hub `_align`/`_notify_email` before `_schema`;
// price_quotes `_backfill` before `_draft_published`).
// Applied in dependency order locally.
const ORDER_FIX: Record<string, string> = {
  '20260507_research_hub_schema.sql': '20260507_research_hub_0schema.sql',
  '20260721_price_quotes_draft_published.sql': '20260721_price_quotes_0draft_published.sql',
}
export const CAMPAIGNS_MIGRATION = '20261026_campaigns_mvp.sql'

const root = path.resolve(__dirname, '../..')
const migrationsDir = path.join(root, 'supabase/migrations')

export function assertLocal(url: string) {
  const host = new URL(url).hostname
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error(`refusing to run against non-local host "${host}"`)
  }
}

export async function resetDatabase(url: string, opts: { log?: boolean } = {}) {
  assertLocal(url)
  const u = new URL(url)
  const dbName = u.pathname.replace(/^\//, '')
  if (!/^[a-z0-9_]+$/.test(dbName)) throw new Error(`bad db name ${dbName}`)
  const admin = new Client({ connectionString: Object.assign(new URL(url), { pathname: '/postgres' }).toString() })
  await admin.connect()
  await admin.query(`drop database if exists ${dbName} with (force)`)
  await admin.query(`create database ${dbName}`)
  await admin.end()

  const c = new Client({ connectionString: url })
  await c.connect()
  try {
    await c.query(readFileSync(path.join(root, 'supabase/tests/supabase-shim.sql'), 'utf8'))
    const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'))
      .sort((a, b) => (ORDER_FIX[a] ?? a).localeCompare(ORDER_FIX[b] ?? b))
    for (const f of files) {
      if (SKIP_LOCALLY.has(f)) {
        if (opts.log) console.log(`skip  ${f} (needs pg_net)`)
        continue
      }
      try {
        await c.query(readFileSync(path.join(migrationsDir, f), 'utf8'))
        if (opts.log) console.log(`apply ${f}`)
      } catch (e) {
        throw new Error(`migration ${f} failed: ${(e as Error).message}`)
      }
    }
  } finally {
    await c.end()
  }
}

export async function applyCampaignsMigration(url: string) {
  assertLocal(url)
  const c = new Client({ connectionString: url })
  await c.connect()
  try {
    await c.query(readFileSync(path.join(migrationsDir, CAMPAIGNS_MIGRATION), 'utf8'))
  } finally {
    await c.end()
  }
}

async function main() {
  const url = process.env.CAMPAIGNS_DATABASE_URL || 'postgres://postgres@localhost:54329/leaders_dev'
  const cmd = process.argv[2]
  if (cmd === 'reset') {
    await resetDatabase(url, { log: true })
    console.log('ok: database reset and migrated')
  } else if (cmd === 'migrate') {
    await applyCampaignsMigration(url)
    console.log('ok: campaigns migration applied')
  } else {
    console.error('usage: db.ts reset|migrate')
    process.exit(2)
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e.message)
    process.exit(1)
  })
}
