/**
 * Message transports. The dispatcher (jobs/worker.ts) calls send() and maps the
 * result onto cm_notifications.status:
 *   sent          provider accepted the message (provider_message_id stored)
 *   dev_not_sent  no provider configured; the message was recorded, NOT delivered
 *   failed        retryable error, will retry with backoff
 *   dead          permanent error or retries exhausted
 *   uncertain     timeout after the request may have reached the provider.
 *                 Gmail has no idempotency key, so we never resend blindly;
 *                 a manager reviews and retries or dismisses.
 */
import { sendGmailViaServiceAccount } from '@/lib/gmail'
import { PRODUCT } from '@/lib/campaigns/brand'

export interface OutgoingMessage {
  to: string
  subject: string
  text: string
  html: string
  idempotencyKey: string
}

export type SendResult =
  | { outcome: 'sent'; provider: string; providerMessageId: string }
  | { outcome: 'dev_not_sent'; provider: 'dev' }

export class TransportError extends Error {
  constructor(message: string, readonly retryable: boolean, readonly uncertain = false) {
    super(message)
  }
}

export interface MessageTransport {
  readonly name: string
  send(m: OutgoingMessage): Promise<SendResult>
}

/** Records nothing externally. Status becomes "not sent — development environment". */
export class DevTransport implements MessageTransport {
  readonly name = 'dev'
  async send(): Promise<SendResult> {
    return { outcome: 'dev_not_sent', provider: 'dev' }
  }
}

export class GmailTransport implements MessageTransport {
  readonly name = 'gmail'
  constructor(
    private from = process.env.CAMPAIGNS_EMAIL_FROM || '',
    private fromName = process.env.CAMPAIGNS_EMAIL_FROM_NAME || PRODUCT.name,
    private timeoutMs = 20_000,
  ) {
    if (!from) throw new Error('CAMPAIGNS_EMAIL_FROM is not configured')
  }

  async send(m: OutgoingMessage): Promise<SendResult> {
    // Staging safety valve: every message goes to one test inbox.
    const redirect = process.env.CAMPAIGNS_EMAIL_REDIRECT_TO
    const to = redirect || m.to
    const subject = redirect ? `[בדיקה → ${m.to}] ${m.subject}` : m.subject
    let timer: NodeJS.Timeout | undefined
    const timeout = new Promise<never>((_, rej) => {
      timer = setTimeout(() => rej(new TransportError('timeout waiting for Gmail', true, true)), this.timeoutMs)
    })
    try {
      const res = await Promise.race([
        sendGmailViaServiceAccount({ from: this.from, fromName: this.fromName, to, subject, html: m.html }),
        timeout,
      ])
      return { outcome: 'sent', provider: 'gmail', providerMessageId: res.messageId }
    } catch (e) {
      if (e instanceof TransportError) throw e
      const status = (e as { code?: number; status?: number }).code ?? (e as { status?: number }).status
      const permanent = typeof status === 'number' && status >= 400 && status < 500 && status !== 429
      throw new TransportError(e instanceof Error ? e.message : String(e), !permanent)
    } finally {
      clearTimeout(timer)
    }
  }
}

export function transportFromEnv(): MessageTransport {
  const kind = process.env.CAMPAIGNS_EMAIL_TRANSPORT || 'dev'
  if (kind === 'gmail') return new GmailTransport()
  return new DevTransport()
}
