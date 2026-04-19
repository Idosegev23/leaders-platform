import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { uploadToGoogleDrive } from '@/lib/google-drive/client'
import { isDevMode, DEV_AUTH_USER } from '@/lib/auth/dev-mode'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // In dev mode, use mock user
    let userId = DEV_AUTH_USER.id
    if (!isDevMode) {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      userId = authUser.id
    }

    const body = await request.json()
    const { documentId } = body

    // Get document from database
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single()

    if (docError || !document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Verify ownership
    if (document.user_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Check if PDF exists
    if (!document.pdf_url) {
      return NextResponse.json(
        { error: 'PDF not generated yet' },
        { status: 400 }
      )
    }

    // Download PDF from Supabase Storage
    const pdfResponse = await fetch(document.pdf_url)
    if (!pdfResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch PDF' },
        { status: 500 }
      )
    }

    const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer())

    // Upload to Google Drive
    const fileName = `${document.title}_${new Date().toISOString().split('T')[0]}.pdf`
    
    try {
      const driveResult = await uploadToGoogleDrive({
        fileName,
        mimeType: 'application/pdf',
        buffer: pdfBuffer,
      })

      // Update document with Drive info
      await supabase
        .from('documents')
        .update({
          drive_file_id: driveResult.fileId,
          drive_file_url: driveResult.webViewLink,
        })
        .eq('id', documentId)

      return NextResponse.json({
        success: true,
        fileId: driveResult.fileId,
        viewUrl: driveResult.webViewLink,
        downloadUrl: driveResult.webContentLink,
      })
    } catch (driveError) {
      console.error('Google Drive upload error:', driveError)
      return NextResponse.json(
        { 
          error: 'Google Drive not configured',
          message: 'הגדר את חיבור Google Drive כדי להשתמש בפיצ\'ר זה'
        },
        { status: 503 }
      )
    }
  } catch (error) {
    console.error('Drive API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}


