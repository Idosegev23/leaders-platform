'use client'

/** Browser-side API helper for the campaigns module. Errors carry the server's Hebrew message. */
export class ApiError extends Error {
  constructor(message: string, readonly code: string, readonly status: number, readonly details?: Record<string, unknown>) {
    super(message)
  }
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; idempotencyKey?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = {}
  if (opts.body !== undefined) headers['content-type'] = 'application/json'
  if (opts.idempotencyKey) headers['idempotency-key'] = opts.idempotencyKey
  let res: Response
  try {
    res = await fetch(path, {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
      cache: 'no-store',
    })
  } catch {
    throw new ApiError('אין חיבור לשרת. בדקו את החיבור לאינטרנט ונסו שוב.', 'NETWORK', 0)
  }
  const text = await res.text()
  let data: unknown = null
  try { data = text ? JSON.parse(text) : null } catch { /* non-JSON */ }
  if (!res.ok) {
    const err = (data as { error?: { code: string; message: string; details?: Record<string, unknown> } } | null)?.error
    throw new ApiError(err?.message ?? 'הפעולה נכשלה. נסו שוב.', err?.code ?? 'HTTP', res.status, err?.details)
  }
  return data as T
}

export function newIdempotencyKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
}
