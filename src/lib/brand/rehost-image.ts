/**
 * Re-host a remote image into our own Supabase storage.
 *
 * Instagram / IMAI profile-photo CDN URLs are signed and expire within hours,
 * so embedding them directly in a deck means the photos 403 by the time anyone
 * opens it. Re-hosting copies the bytes to the `assets` bucket and returns a
 * stable public URL. Best-effort: returns null on any failure (dead URL,
 * non-image, oversize) so callers degrade gracefully.
 */

type StorageClient = {
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        body: Buffer,
        opts: { contentType: string; upsert: boolean },
      ) => Promise<{ error: unknown }>
      getPublicUrl: (path: string) => { data: { publicUrl: string } }
    }
  }
}

const MAX_BYTES = 8_000_000

/**
 * Fetch `url` and upload it under `assets/<prefix>/<name>.<ext>`. Returns the
 * public URL, or null if the source could not be fetched as an image.
 * `name` should be a stable slug (e.g. an influencer handle) so re-runs upsert
 * the same object instead of piling up duplicates.
 */
export async function rehostImage(
  url: string,
  prefix: string,
  name: string,
  supabase: StorageClient,
): Promise<string | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000), redirect: 'follow' })
    if (!res.ok) return null
    const ct = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    if (!ct.startsWith('image/')) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 512 || buf.length > MAX_BYTES) return null
    const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg'
    const slug = name.replace(/[^a-z0-9_-]/gi, '').slice(0, 60) || 'img'
    const path = `${prefix}/${slug}.${ext}`
    const { error } = await supabase.storage.from('assets').upload(path, buf, { contentType: ct, upsert: true })
    if (error) return null
    return supabase.storage.from('assets').getPublicUrl(path).data.publicUrl
  } catch {
    return null
  }
}

/**
 * Clean a raw IMAI/Instagram display name for a client-facing slide.
 * IMAI returns names like "🥦 Oz Telem עז תלם" or "Gil Harel | גיל הראל | דקירה קטנה"
 * — strip emojis/handles, split on separators, and prefer a Hebrew segment
 * (this is a Hebrew deck) over the Latin one; fall back to the first clean segment.
 */
export function cleanInfluencerName(raw: string | undefined | null, fallbackHandle?: string): string {
  const stripped = (raw || '')
    // drop emoji / pictographs / symbols (no `u` flag — project TS target):
    // astral-plane emoji via surrogate pairs, then BMP dingbats/arrows/symbols
    // + variation selector + ZWJ. Punctuation separators are left intact.
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')
    .replace(/[←-⇿☀-➿⬀-⯿️‍]/g, '')
    .trim()

  const segments = stripped
    .split(/[|•·\-–—]|(?:\s{2,})/)
    .map((s) => s.trim())
    .filter((s) => s && !/^@/.test(s) && !/^https?:/i.test(s))

  const hasHebrew = (s: string) => /[֐-׿]/.test(s)
  const isTagline = (s: string) => s.split(/\s+/).length > 4 // "כל המתכונים בבלוג" etc.

  const hebrew = segments.find((s) => hasHebrew(s) && !isTagline(s))
  if (hebrew) return hebrew.replace(/\s+/g, ' ').trim()

  const latin = segments.find((s) => /[A-Za-z]/.test(s) && !isTagline(s))
  if (latin) return latin.replace(/\s+/g, ' ').trim()

  const first = segments[0]
  if (first) return first.replace(/\s+/g, ' ').trim()
  return (fallbackHandle || '').replace(/^@/, '') || 'משפיען'
}
