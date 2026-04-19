import type { ParsedDocument } from '@/types/brief'

/**
 * Parse Word (DOCX) documents using mammoth
 */
export async function parseDocx(buffer: Buffer): Promise<ParsedDocument> {
  const parserId = `docx-${Date.now()}`
  const startTime = Date.now()
  console.log(`[${parserId}] 📝 DOCX PARSER - START`)
  console.log(`[${parserId}] 📝 Buffer size: ${buffer.length} bytes (${(buffer.length / 1024).toFixed(1)}KB)`)

  console.log(`[${parserId}] 🔄 Loading mammoth module...`)
  const moduleStart = Date.now()
  const mammoth = await import('mammoth')
  console.log(`[${parserId}] ✅ Module loaded in ${Date.now() - moduleStart}ms`)

  // Extract raw text (preserves structure)
  console.log(`[${parserId}] 🔄 Extracting raw text...`)
  const textStart = Date.now()
  const textResult = await mammoth.extractRawText({ buffer })
  const text = textResult.value?.trim() || ''
  console.log(`[${parserId}] ✅ Text extracted in ${Date.now() - textStart}ms: ${text.length} chars`)

  // Also get HTML to detect tables and images
  console.log(`[${parserId}] 🔄 Converting to HTML for structure detection...`)
  const htmlStart = Date.now()
  const htmlResult = await mammoth.convertToHtml({ buffer })
  const html = htmlResult.value || ''
  console.log(`[${parserId}] ✅ HTML converted in ${Date.now() - htmlStart}ms: ${html.length} chars`)

  const hasTables = html.includes('<table')
  const hasImages = html.includes('<img')
  const isHebrew = detectHebrew(text)

  console.log(`[${parserId}] 📊 Results:`)
  console.log(`[${parserId}]   Text length: ${text.length} chars`)
  console.log(`[${parserId}]   Language: ${isHebrew ? 'Hebrew' : 'English'}`)
  console.log(`[${parserId}]   Has tables: ${hasTables}`)
  console.log(`[${parserId}]   Has images: ${hasImages}`)
  console.log(`[${parserId}]   First 200 chars: ${text.slice(0, 200).replace(/\n/g, ' ')}`)
  if (textResult.messages?.length) {
    console.log(`[${parserId}]   Mammoth warnings: ${textResult.messages.map((m: { message: string }) => m.message).join('; ')}`)
  }

  if (!text || text.length < 10) {
    console.error(`[${parserId}] ❌ No readable text in DOCX (${text.length} chars)`)
    throw new Error('DOCX file contains no readable text')
  }

  console.log(`[${parserId}] ⏱️ TOTAL TIME: ${Date.now() - startTime}ms`)

  return {
    text,
    metadata: {
      format: 'docx',
      language: isHebrew ? 'he' : 'en',
      hasImages,
      hasTables,
    },
  }
}

function detectHebrew(text: string): boolean {
  return (text.match(/[\u0590-\u05FF]/g) || []).length > 10
}
