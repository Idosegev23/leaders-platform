/**
 * Gemini Files API helper
 *
 * Upload a file (PDF, image, etc.) once and reference it in multiple
 * generateContent calls. Better than inlining text:
 * - Preserves layout, tables, charts (Gemini reads PDFs natively)
 * - Free (no extra cost beyond storage)
 * - 48-hour TTL
 * - Up to 2GB per file, 20GB project quota
 *
 * Use for: brief PDFs, reference images for slide gen, large research docs.
 */

import { GoogleGenAI } from '@google/genai'

let _client: GoogleGenAI | null = null
function getClient(): GoogleGenAI {
  if (!_client) {
    _client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' })
  }
  return _client
}

export interface UploadedFile {
  /** Resource URI like "files/abc123" — pass to generateContent contents */
  uri: string
  /** Original mime type */
  mimeType: string
  /** Display name (filename) */
  displayName: string
  /** Size in bytes */
  sizeBytes: number
  /** ISO timestamp when file expires (auto-deleted by Google after 48h) */
  expirationTime?: string
}

/**
 * Upload a buffer to Gemini Files API.
 * @param buffer - the file bytes
 * @param mimeType - e.g. "application/pdf", "image/png"
 * @param displayName - filename for logs
 */
export async function uploadToGeminiFiles(
  buffer: Buffer,
  mimeType: string,
  displayName: string,
): Promise<UploadedFile> {
  const requestId = `files-${Date.now()}`
  const sizeKb = Math.round(buffer.length / 1024)
  console.log(`[GeminiFiles][${requestId}] 📤 Uploading "${displayName}" (${sizeKb}KB, ${mimeType})`)
  const t0 = Date.now()

  const client = getClient()

  // The SDK uploads via Blob — convert buffer to Blob
  const blob = new Blob([new Uint8Array(buffer)], { type: mimeType })

  const uploaded: any = await (client as any).files.upload({
    file: blob,
    config: {
      mimeType,
      displayName,
    },
  })

  const elapsed = Date.now() - t0
  const uri = uploaded.uri || uploaded.name || ''
  console.log(`[GeminiFiles][${requestId}] ✅ Uploaded in ${elapsed}ms — uri=${uri}`)
  console.log(`[GeminiFiles][${requestId}]    expires: ${uploaded.expirationTime || '~48h'}`)

  return {
    uri,
    mimeType,
    displayName,
    sizeBytes: buffer.length,
    expirationTime: uploaded.expirationTime,
  }
}

/**
 * Build a Gemini content part referencing an uploaded file.
 * Use as part of the contents array in generateContent.
 */
export function fileReferencePart(file: UploadedFile): Record<string, unknown> {
  return {
    fileData: {
      mimeType: file.mimeType,
      fileUri: file.uri,
    },
  }
}

/**
 * Delete an uploaded file (cleanup before 48h auto-expiration).
 */
export async function deleteGeminiFile(uri: string): Promise<void> {
  try {
    const client = getClient()
    await (client as any).files.delete({ name: uri })
    console.log(`[GeminiFiles] 🗑️ Deleted ${uri}`)
  } catch (err) {
    console.warn(`[GeminiFiles] Failed to delete ${uri}:`, err)
  }
}
