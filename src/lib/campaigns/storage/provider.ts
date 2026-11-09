/**
 * Object storage behind an interface. The bytes never go into Postgres and
 * never stream through the app server in production: the browser uploads
 * straight to a short-lived signed URL, then the server verifies the object.
 */
export interface UploadTarget {
  url: string
  method: 'PUT'
  headers: Record<string, string>
  expiresAt: Date
}

export interface ObjectInfo {
  size: number
  contentType: string | null
}

export interface StorageProvider {
  readonly name: 'supabase' | 'local'
  createUploadTarget(key: string, contentType: string): Promise<UploadTarget>
  stat(key: string): Promise<ObjectInfo | null>
  /** First bytes of the object, to check the real file type. */
  readHead(key: string, bytes: number): Promise<Buffer>
  createDownloadUrl(key: string, ttlSeconds: number, downloadName?: string): Promise<string>
  remove(key: string): Promise<void>
}

export const MIME_RULES: Record<string, { ext: string; kind: 'image' | 'video' | 'pdf' }> = {
  'image/jpeg': { ext: 'jpg', kind: 'image' },
  'image/png': { ext: 'png', kind: 'image' },
  'image/webp': { ext: 'webp', kind: 'image' },
  'video/mp4': { ext: 'mp4', kind: 'video' },
  'video/quicktime': { ext: 'mov', kind: 'video' },
  'application/pdf': { ext: 'pdf', kind: 'pdf' },
}

export function maxBytesFor(kind: 'image' | 'video' | 'pdf'): number {
  const mb = {
    image: Number(process.env.CAMPAIGNS_MAX_IMAGE_MB || 25),
    video: Number(process.env.CAMPAIGNS_MAX_VIDEO_MB || 500),
    pdf: Number(process.env.CAMPAIGNS_MAX_PDF_MB || 25),
  }[kind]
  return Math.floor(mb * 1024 * 1024)
}

/** Magic-number check: does the file actually look like the declared type? */
export function sniffMatches(mime: string, head: Buffer): boolean {
  const b = head
  switch (mime) {
    case 'image/jpeg': return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
    case 'image/png': return b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    case 'image/webp': return b.length >= 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP'
    case 'application/pdf': return b.length >= 5 && b.subarray(0, 5).toString('latin1') === '%PDF-'
    case 'video/mp4':
    case 'video/quicktime': return b.length >= 12 && b.subarray(4, 8).toString('latin1') === 'ftyp'
    default: return false
  }
}
