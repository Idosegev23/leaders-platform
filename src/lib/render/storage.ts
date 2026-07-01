import { createSupabaseService } from '@/lib/research-hub/service'

const DEFAULT_BUCKET = 'documents'
const DEFAULT_EXPIRY_SECONDS = 60 * 60 * 24 * 7 // 7 days

/** Deterministic storage key for a deck artifact. `ts` defaults to now. */
export function deckArtifactPath(
  documentId: string,
  kind: 'pdf' | 'pptx',
  ts: number = Date.now(),
): string {
  return `decks/${documentId}/${ts}.${kind}`
}

/** Upload a buffer and return a signed URL. Throws (never swallows) on failure
 *  so the caller's route returns a real 5xx instead of a dead URL. */
export async function uploadAndSignedUrl(args: {
  bucket?: string
  path: string
  body: Buffer
  contentType: string
  expiresIn?: number
}): Promise<{ signedUrl: string; path: string }> {
  const bucket = args.bucket ?? DEFAULT_BUCKET
  const sb = createSupabaseService()

  const { error: upErr } = await sb.storage
    .from(bucket)
    .upload(args.path, args.body, { contentType: args.contentType, upsert: true })
  if (upErr) {
    throw new Error(`storage upload failed (${bucket}/${args.path}): ${upErr.message}`)
  }

  const { data, error: signErr } = await sb.storage
    .from(bucket)
    .createSignedUrl(args.path, args.expiresIn ?? DEFAULT_EXPIRY_SECONDS)
  if (signErr || !data?.signedUrl) {
    throw new Error(
      `createSignedUrl failed (${bucket}/${args.path}): ${signErr?.message ?? 'no url returned'}`,
    )
  }
  return { signedUrl: data.signedUrl, path: args.path }
}
