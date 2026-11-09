/**
 * Supabase Storage, private bucket (default `campaign-media`). The bucket must
 * be created PRIVATE (see deployment-runbook.md); this code never makes
 * objects public and only hands out signed URLs after an access check.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { ObjectInfo, StorageProvider, UploadTarget } from './provider'

export class SupabaseStorage implements StorageProvider {
  readonly name = 'supabase' as const
  private sb: SupabaseClient
  constructor(private bucket = process.env.CAMPAIGNS_STORAGE_BUCKET || 'campaign-media') {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error('Supabase storage not configured')
    this.sb = createClient(url, key, { auth: { persistSession: false } })
  }

  async createUploadTarget(key: string, contentType: string): Promise<UploadTarget> {
    const { data, error } = await this.sb.storage.from(this.bucket).createSignedUploadUrl(key)
    if (error || !data) throw new Error(`signed upload url failed: ${error?.message}`)
    // Supabase signed upload URLs are valid for 2 hours.
    return { url: data.signedUrl, method: 'PUT', headers: { 'content-type': contentType }, expiresAt: new Date(Date.now() + 2 * 3600_000) }
  }

  async stat(key: string): Promise<ObjectInfo | null> {
    const { data, error } = await this.sb.storage.from(this.bucket).info(key)
    if (error || !data) return null
    return { size: Number(data.size ?? 0), contentType: data.contentType ?? null }
  }

  async readHead(key: string, bytes: number): Promise<Buffer> {
    const url = await this.createDownloadUrl(key, 60)
    const res = await fetch(url, { headers: { range: `bytes=0-${bytes - 1}` } })
    if (!res.ok && res.status !== 206) throw new Error(`read head failed: ${res.status}`)
    return Buffer.from(await res.arrayBuffer()).subarray(0, bytes)
  }

  async createDownloadUrl(key: string, ttlSeconds: number, downloadName?: string): Promise<string> {
    const { data, error } = await this.sb.storage.from(this.bucket)
      .createSignedUrl(key, ttlSeconds, downloadName ? { download: downloadName } : undefined)
    if (error || !data) throw new Error(`signed url failed: ${error?.message}`)
    return data.signedUrl
  }

  async remove(key: string): Promise<void> {
    const { error } = await this.sb.storage.from(this.bucket).remove([key])
    if (error) throw new Error(`remove failed: ${error.message}`)
  }
}
