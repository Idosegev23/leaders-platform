import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseDocument, parseGoogleDoc } from '@/lib/parsers'
import { getAuthenticatedUser } from '@/lib/auth/api-auth'
import { uploadToGeminiFiles } from '@/lib/gemini/files-api'

export const maxDuration = 600

export async function POST(request: NextRequest) {
  const requestId = `parse-${Date.now()}`
  const startTime = Date.now()

  const user = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log(`[${requestId}] 📄 PARSE DOCUMENT - START`)
  console.log(`${'='.repeat(60)}`)

  try {
    const contentType = request.headers.get('content-type') || ''
    console.log(`[${requestId}] Content-Type: ${contentType}`)

    // Handle JSON body (Google Docs link OR storage URL for large files)
    if (contentType.includes('application/json')) {
      const body = await request.json()
      const { googleDocsUrl, storageUrl, fileName, fileType, docType } = body

      // ── Large file path: client uploaded to Supabase, we download + parse ──
      if (storageUrl) {
        console.log(`[${requestId}] 📦 Large file via storage URL: ${storageUrl}`)
        console.log(`[${requestId}] 📋 Name: ${fileName}, Type: ${fileType}, DocType: ${docType}`)

        const fileRes = await fetch(storageUrl)
        if (!fileRes.ok) {
          return NextResponse.json({ error: 'Failed to download file from storage' }, { status: 400 })
        }
        const buffer = Buffer.from(await fileRes.arrayBuffer())
        console.log(`[${requestId}] 📦 Downloaded ${(buffer.length / 1024 / 1024).toFixed(1)}MB from storage`)

        // Upload to Gemini Files API
        const isUploadable = /^(application\/pdf|image\/(png|jpeg|jpg|webp))/.test(fileType || '')
        let geminiFileUri: string | undefined
        let geminiFileMime: string | undefined
        if (isUploadable) {
          try {
            const geminiFile = await uploadToGeminiFiles(buffer, fileType || 'application/pdf', fileName || 'document')
            geminiFileUri = geminiFile.uri
            geminiFileMime = geminiFile.mimeType
          } catch (err) {
            console.warn(`[${requestId}] ⚠️ Gemini Files upload failed (non-critical):`, err)
          }
        }

        // Parse text
        const parsed = await parseDocument(buffer, fileType || 'application/pdf', fileName || 'document.pdf')
        console.log(`[${requestId}] ✅ Parsed via storage: ${parsed.text.length} chars`)

        return NextResponse.json({
          success: true,
          parsedText: parsed.text,
          metadata: parsed.metadata,
          fileName,
          docType,
          geminiFileUri,
          geminiFileMime,
        })
      }

      if (!googleDocsUrl) {
        console.log(`[${requestId}] ❌ Missing googleDocsUrl or storageUrl`)
        return NextResponse.json({ error: 'Missing googleDocsUrl or storageUrl' }, { status: 400 })
      }

      console.log(`[${requestId}] 🔗 Google Docs URL: ${googleDocsUrl}`)
      console.log(`[${requestId}] 📋 Doc Type: ${docType}`)

      const parseStart = Date.now()
      const parsed = await parseGoogleDoc(googleDocsUrl)
      const parseTime = Date.now() - parseStart

      console.log(`[${requestId}] ✅ Google Doc parsed in ${parseTime}ms`)
      console.log(`[${requestId}] 📊 Result: ${parsed.text.length} chars, format: ${parsed.metadata.format}`)
      console.log(`[${requestId}] 📊 Language: ${parsed.metadata.language}, tables: ${parsed.metadata.hasTables}, images: ${parsed.metadata.hasImages}`)
      console.log(`[${requestId}] ⏱️ Total time: ${Date.now() - startTime}ms`)

      return NextResponse.json({
        success: true,
        parsedText: parsed.text,
        metadata: parsed.metadata,
        docType,
      })
    }

    // Handle file upload (FormData)
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const docType = formData.get('docType') as string | null

    if (!file) {
      console.log(`[${requestId}] ❌ No file in FormData`)
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    console.log(`[${requestId}] 📎 File: ${file.name}`)
    console.log(`[${requestId}] 📎 MIME: ${file.type}`)
    console.log(`[${requestId}] 📎 Size: ${(file.size / 1024).toFixed(1)}KB (${file.size} bytes)`)
    console.log(`[${requestId}] 📋 Doc Type: ${docType}`)

    // Validate file size (20MB)
    if (file.size > 20 * 1024 * 1024) {
      console.log(`[${requestId}] ❌ File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB`)
      return NextResponse.json(
        { error: 'File too large. Maximum size is 20MB.' },
        { status: 400 }
      )
    }

    // Convert file to buffer
    console.log(`[${requestId}] 🔄 Converting to buffer...`)
    const bufferStart = Date.now()
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    console.log(`[${requestId}] ✅ Buffer ready: ${buffer.length} bytes (${Date.now() - bufferStart}ms)`)

    // Upload to Supabase Storage
    console.log(`[${requestId}] ☁️ Uploading to Supabase Storage...`)
    const uploadStart = Date.now()
    const supabase = await createClient()
    const timestamp = Date.now()
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const storagePath = `documents/briefs/${docType || 'doc'}_${timestamp}_${sanitizedName}`
    console.log(`[${requestId}] ☁️ Storage path: ${storagePath}`)

    const { error: uploadError } = await supabase.storage
      .from('assets')
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: true,
      })

    if (uploadError) {
      console.error(`[${requestId}] ⚠️ Upload failed (continuing anyway):`, uploadError.message)
    } else {
      console.log(`[${requestId}] ✅ Upload complete (${Date.now() - uploadStart}ms)`)
    }

    // Get public URL
    let storageUrl: string | undefined
    if (!uploadError) {
      const { data: urlData } = supabase.storage
        .from('assets')
        .getPublicUrl(storagePath)
      storageUrl = urlData.publicUrl
      console.log(`[${requestId}] 🔗 Public URL: ${storageUrl?.slice(0, 80)}...`)
    }

    // ── Upload to Gemini Files API in parallel with text extraction ──
    // PDFs benefit hugely: Gemini reads layout/tables/charts natively (better than text extraction)
    const isUploadable = /^(application\/pdf|image\/(png|jpeg|jpg|webp|heic|heif))/.test(file.type)
    let geminiFileUri: string | undefined
    let geminiFileMime: string | undefined
    if (isUploadable) {
      console.log(`[${requestId}] 📤 Uploading to Gemini Files API in parallel...`)
    }
    const geminiUploadPromise = isUploadable
      ? uploadToGeminiFiles(buffer, file.type, file.name).catch(err => {
          console.warn(`[${requestId}] ⚠️ Gemini Files upload failed (non-critical):`, err)
          return null
        })
      : Promise.resolve(null)

    // Parse the document
    console.log(`[${requestId}] 🔍 Starting document parsing...`)
    const parseStart = Date.now()
    const [parsed, geminiFile] = await Promise.all([
      parseDocument(buffer, file.type, file.name),
      geminiUploadPromise,
    ])
    if (geminiFile) {
      geminiFileUri = geminiFile.uri
      geminiFileMime = geminiFile.mimeType
      console.log(`[${requestId}] ✅ Gemini file ready: ${geminiFileUri}`)
    }
    const parseTime = Date.now() - parseStart

    console.log(`[${requestId}] ✅ Document parsed in ${parseTime}ms`)
    console.log(`[${requestId}] 📊 Result: ${parsed.text.length} chars`)
    console.log(`[${requestId}] 📊 Format: ${parsed.metadata.format}`)
    console.log(`[${requestId}] 📊 Language: ${parsed.metadata.language}`)
    console.log(`[${requestId}] 📊 Has tables: ${parsed.metadata.hasTables}`)
    console.log(`[${requestId}] 📊 Has images: ${parsed.metadata.hasImages}`)
    if (parsed.metadata.pageCount) {
      console.log(`[${requestId}] 📊 Pages: ${parsed.metadata.pageCount}`)
    }
    console.log(`[${requestId}] 📝 First 200 chars: ${parsed.text.slice(0, 200).replace(/\n/g, ' ')}`)
    console.log(`[${requestId}] ⏱️ TOTAL TIME: ${Date.now() - startTime}ms`)
    console.log(`${'='.repeat(60)}\n`)

    return NextResponse.json({
      success: true,
      storageUrl,
      parsedText: parsed.text,
      metadata: parsed.metadata,
      fileName: file.name,
      docType,
      geminiFileUri,
      geminiFileMime,
    })
  } catch (error) {
    const elapsed = Date.now() - startTime
    console.error(`[${requestId}] ❌ ERROR after ${elapsed}ms:`, error)
    console.error(`[${requestId}] Stack:`, error instanceof Error ? error.stack : 'N/A')
    const message = error instanceof Error ? error.message : 'Failed to parse document'

    const isExpectedError =
      message.includes('Service Account not configured') ||
      message.includes('Invalid Google Docs URL') ||
      message.includes('Unsupported file format') ||
      message.includes('File too large') ||
      message.includes('אין גישה')
    const status = isExpectedError ? 400 : 500

    return NextResponse.json({ error: message }, { status })
  }
}
