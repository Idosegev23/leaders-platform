import type { ParsedDocument } from '@/types/brief'

/**
 * Parse Google Docs by exporting as plain text via Drive API
 */
export async function parseGoogleDoc(docUrl: string): Promise<ParsedDocument> {
  const parserId = `gdocs-${Date.now()}`
  const startTime = Date.now()
  console.log(`[${parserId}] 📗 GOOGLE DOCS PARSER - START`)
  console.log(`[${parserId}] 🔗 URL: ${docUrl}`)

  // Extract document ID from URL
  const docIdMatch = docUrl.match(/\/document\/d\/([a-zA-Z0-9_-]+)/)
  if (!docIdMatch) {
    console.error(`[${parserId}] ❌ Invalid URL format - could not extract document ID`)
    throw new Error('Invalid Google Docs URL. Expected format: https://docs.google.com/document/d/...')
  }

  const docId = docIdMatch[1]
  console.log(`[${parserId}] 🆔 Document ID: ${docId}`)

  const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!credentialsJson) {
    console.error(`[${parserId}] ❌ GOOGLE_SERVICE_ACCOUNT_KEY not configured`)
    throw new Error(
      'Google Service Account not configured. Please export the document as PDF or Word and upload it instead.'
    )
  }
  console.log(`[${parserId}] 🔑 Service account key: ${credentialsJson.length} chars`)

  try {
    console.log(`[${parserId}] 🔄 Loading googleapis module...`)
    const moduleStart = Date.now()
    const { google } = await import('googleapis')
    console.log(`[${parserId}] ✅ Module loaded in ${Date.now() - moduleStart}ms`)

    console.log(`[${parserId}] 🔄 Authenticating with service account...`)
    const authStart = Date.now()
    const credentials = JSON.parse(credentialsJson)
    console.log(`[${parserId}]   Service account email: ${credentials.client_email || 'unknown'}`)
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: [
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/documents.readonly',
      ],
    })
    console.log(`[${parserId}] ✅ Auth configured in ${Date.now() - authStart}ms`)

    const drive = google.drive({ version: 'v3', auth })

    // Export as plain text
    console.log(`[${parserId}] 🔄 Exporting document as plain text...`)
    const exportStart = Date.now()
    const response = await drive.files.export({
      fileId: docId,
      mimeType: 'text/plain',
    })
    const exportTime = Date.now() - exportStart

    const text = (response.data as string)?.trim() || ''
    const isHebrew = detectHebrew(text)
    const hasTables = text.includes('\t')

    console.log(`[${parserId}] ✅ Export completed in ${exportTime}ms`)
    console.log(`[${parserId}] 📊 Extracted: ${text.length} chars`)
    console.log(`[${parserId}] 📊 Language: ${isHebrew ? 'Hebrew' : 'English'}`)
    console.log(`[${parserId}] 📊 Has tables: ${hasTables}`)
    console.log(`[${parserId}] 📊 First 200 chars: ${text.slice(0, 200).replace(/\n/g, ' ')}`)

    if (!text || text.length < 10) {
      console.error(`[${parserId}] ❌ Document appears empty (${text.length} chars)`)
      throw new Error('Document appears to be empty')
    }

    console.log(`[${parserId}] ⏱️ TOTAL TIME: ${Date.now() - startTime}ms`)

    return {
      text,
      metadata: {
        format: 'google-docs',
        language: isHebrew ? 'he' : 'en',
        hasImages: false,
        hasTables,
      },
    }
  } catch (error: unknown) {
    const elapsed = Date.now() - startTime
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[${parserId}] ❌ ERROR after ${elapsed}ms: ${message}`)
    if (error instanceof Error) {
      console.error(`[${parserId}] Stack:`, error.stack)
    }

    if (message.includes('403') || message.includes('not found') || message.includes('404')) {
      throw new Error(
        'אין גישה למסמך. וודא שהמסמך משותף עם חשבון השירות, או ייצא אותו כ-PDF והעלה ידנית.'
      )
    }

    throw new Error(`Failed to read Google Doc: ${message}`)
  }
}

function detectHebrew(text: string): boolean {
  return (text.match(/[\u0590-\u05FF]/g) || []).length > 10
}
