/**
 * SSRF Protection — validates URLs before external fetch.
 * Blocks internal/private network addresses to prevent Server-Side Request Forgery.
 */

const BLOCKED_HOSTNAMES = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '169.254.169.254', // AWS metadata
  'metadata.google.internal', // GCP metadata
]

const BLOCKED_PREFIXES = [
  '10.',
  '172.16.', '172.17.', '172.18.', '172.19.',
  '172.20.', '172.21.', '172.22.', '172.23.',
  '172.24.', '172.25.', '172.26.', '172.27.',
  '172.28.', '172.29.', '172.30.', '172.31.',
  '192.168.',
]

export function validateExternalUrl(input: string): string {
  let urlStr = input.trim()
  if (!urlStr.startsWith('http://') && !urlStr.startsWith('https://')) {
    urlStr = `https://${urlStr}`
  }

  const parsed = new URL(urlStr)

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only HTTP and HTTPS URLs are allowed')
  }

  const hostname = parsed.hostname.toLowerCase()

  for (const blocked of BLOCKED_HOSTNAMES) {
    if (hostname === blocked) {
      throw new Error('URL points to internal/private network — blocked')
    }
  }

  for (const prefix of BLOCKED_PREFIXES) {
    if (hostname.startsWith(prefix)) {
      throw new Error('URL points to internal/private network — blocked')
    }
  }

  if (hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new Error('URL points to local/internal domain — blocked')
  }

  return parsed.href
}
