/**
 * Development/test storage on the local filesystem. Mimics signed URLs with an
 * HMAC over (op, key, expiry), served by /api/campaigns/storage/local.
 * Refuses to construct in production.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { mkdir, open, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { ObjectInfo, StorageProvider, UploadTarget } from './provider'

// Deterministic fallback so every route bundle in `next dev` signs and
// verifies with the same key (a per-module random value broke uploads).
// Development only; this class refuses to run in production.
const devSecret = createHash('sha256').update(`cm-local-storage:${process.cwd()}`).digest('hex')

export class LocalStorage implements StorageProvider {
  readonly name = 'local' as const
  readonly root: string
  private secret: string
  private baseUrl: string
  constructor(opts: { root?: string; baseUrl?: string; secret?: string } = {}) {
    if (process.env.NODE_ENV === 'production') throw new Error('local storage is disabled in production')
    this.root = path.resolve(opts.root || process.env.CAMPAIGNS_LOCAL_STORAGE_DIR || '.data/campaign-media')
    this.secret = opts.secret || process.env.CAMPAIGNS_LOCAL_STORAGE_SECRET || devSecret
    this.baseUrl = (opts.baseUrl || '').replace(/\/$/, '')
  }

  filePath(key: string): string {
    if (!/^[a-z0-9/_.-]+$/i.test(key) || key.includes('..')) throw new Error('bad storage key')
    return path.join(this.root, key)
  }

  sign(op: 'put' | 'get', key: string, exp: number): string {
    return createHmac('sha256', this.secret).update(`${op}\n${key}\n${exp}`).digest('base64url')
  }

  verify(op: 'put' | 'get', key: string, exp: number, sig: string, now = Date.now()): boolean {
    if (!Number.isFinite(exp) || exp < now) return false
    const a = Buffer.from(this.sign(op, key, exp))
    const b = Buffer.from(sig)
    return a.length === b.length && timingSafeEqual(a, b)
  }

  private url(op: 'put' | 'get', key: string, ttlMs: number, extra = ''): string {
    const exp = Date.now() + ttlMs
    const q = new URLSearchParams({ op, key, exp: String(exp), sig: this.sign(op, key, exp) })
    return `${this.baseUrl}/api/campaigns/storage/local?${q}${extra}`
  }

  async createUploadTarget(key: string, contentType: string): Promise<UploadTarget> {
    return { url: this.url('put', key, 2 * 3600_000), method: 'PUT', headers: { 'content-type': contentType }, expiresAt: new Date(Date.now() + 2 * 3600_000) }
  }

  async write(key: string, data: Buffer, contentType: string): Promise<void> {
    const p = this.filePath(key)
    await mkdir(path.dirname(p), { recursive: true })
    await writeFile(p, data)
    await writeFile(`${p}.meta.json`, JSON.stringify({ contentType }))
  }

  async stat(key: string): Promise<ObjectInfo | null> {
    try {
      const s = await stat(this.filePath(key))
      let contentType: string | null = null
      try {
        contentType = JSON.parse(await readFile(`${this.filePath(key)}.meta.json`, 'utf8')).contentType
      } catch { /* no meta */ }
      return { size: s.size, contentType }
    } catch {
      return null
    }
  }

  async readHead(key: string, bytes: number): Promise<Buffer> {
    const fh = await open(this.filePath(key), 'r')
    try {
      const buf = Buffer.alloc(bytes)
      const { bytesRead } = await fh.read(buf, 0, bytes, 0)
      return buf.subarray(0, bytesRead)
    } finally {
      await fh.close()
    }
  }

  async createDownloadUrl(key: string, ttlSeconds: number, downloadName?: string): Promise<string> {
    return this.url('get', key, ttlSeconds * 1000, downloadName ? `&name=${encodeURIComponent(downloadName)}` : '')
  }

  async remove(key: string): Promise<void> {
    await rm(this.filePath(key), { force: true })
    await rm(`${this.filePath(key)}.meta.json`, { force: true })
  }
}
