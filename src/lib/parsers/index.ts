import type { ParsedDocument } from '@/types/brief'
import { parsePdf } from './pdf-parser'
import { parseDocx } from './docx-parser'
import { parseImage } from './image-parser'
import { parseGoogleDoc } from './google-docs-parser'

const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
  'image/webp',
]

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB

/**
 * Parse a document by dispatching to the appropriate parser based on MIME type
 */
export async function parseDocument(
  buffer: Buffer,
  mimeType: string,
  originalFileName?: string
): Promise<ParsedDocument> {
  const dispatchId = `dispatch-${Date.now()}`
  console.log(`[${dispatchId}] 🔀 PARSER DISPATCH`)
  console.log(`[${dispatchId}]   MIME type: ${mimeType}`)
  console.log(`[${dispatchId}]   File name: ${originalFileName || 'unknown'}`)
  console.log(`[${dispatchId}]   Buffer size: ${buffer.length} bytes (${(buffer.length / 1024).toFixed(1)}KB)`)

  // Validate file size
  if (buffer.length > MAX_FILE_SIZE) {
    console.error(`[${dispatchId}] ❌ File too large: ${(buffer.length / 1024 / 1024).toFixed(1)}MB > 20MB limit`)
    throw new Error(`File too large. Maximum size is 20MB. Got ${Math.round(buffer.length / 1024 / 1024)}MB.`)
  }

  // PDF
  if (mimeType === 'application/pdf') {
    console.log(`[${dispatchId}] ➡️ Routing to PDF parser`)
    return parsePdf(buffer)
  }

  // Word DOCX
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    originalFileName?.endsWith('.docx')
  ) {
    console.log(`[${dispatchId}] ➡️ Routing to DOCX parser`)
    return parseDocx(buffer)
  }

  // Images
  if (mimeType.startsWith('image/')) {
    console.log(`[${dispatchId}] ➡️ Routing to Image parser`)
    return parseImage(buffer, mimeType)
  }

  console.error(`[${dispatchId}] ❌ Unsupported file format: ${mimeType}`)
  throw new Error(
    `Unsupported file format: ${mimeType}. Supported formats: PDF, Word (DOCX), PNG, JPEG, WebP.`
  )
}

export { parseGoogleDoc, SUPPORTED_MIME_TYPES, MAX_FILE_SIZE }
