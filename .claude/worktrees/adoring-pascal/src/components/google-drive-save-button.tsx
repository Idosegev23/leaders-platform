'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { useGooglePicker } from '@/hooks/use-google-picker'
import type { GooglePickerCallbackData } from '@/hooks/use-google-picker'

interface GoogleDriveSaveButtonProps {
  getFileData: () => Promise<{ blob: Blob; fileName: string; mimeType: string }>
  onSaved?: (result: { fileId: string; webViewLink: string }) => void
  onError?: (error: Error) => void
  disabled?: boolean
  label?: string
  className?: string
}

export default function GoogleDriveSaveButton({
  getFileData,
  onSaved,
  onError,
  disabled,
  label,
  className,
}: GoogleDriveSaveButtonProps) {
  const [phase, setPhase] = useState<'idle' | 'picking' | 'generating' | 'uploading'>('idle')
  const { isConfigured, scriptsLoaded, apiKey, getAccessToken } = useGooglePicker()

  const handleClick = useCallback(async () => {
    if (!window.google?.picker) {
      console.error('[Drive Save] Picker API not loaded')
      return
    }

    setPhase('picking')

    try {
      const accessToken = await getAccessToken()

      if (!accessToken) {
        console.error('[Drive Save] No provider token - user needs to re-login')
        alert('נדרשת התחברות מחדש עם Google כדי לגשת ל-Drive. אנא התנתק והתחבר שוב.')
        setPhase('idle')
        return
      }

      const picker = window.google.picker!

      // Folder views
      // 1. My Drive folders
      const myFolders = new picker.DocsView(picker.ViewId.FOLDERS)
      myFolders.setIncludeFolders(true)
      myFolders.setSelectFolderEnabled(true)

      // 2. Shared with me folders
      const sharedFolders = new picker.DocsView(picker.ViewId.FOLDERS)
      sharedFolders.setIncludeFolders(true)
      sharedFolders.setSelectFolderEnabled(true)
      sharedFolders.setOwnedByMe(false)

      // 3. Shared Drive folders
      const sharedDriveFolders = new picker.DocsView(picker.ViewId.FOLDERS)
      sharedDriveFolders.setIncludeFolders(true)
      sharedDriveFolders.setSelectFolderEnabled(true)
      sharedDriveFolders.setEnableDrives(true)

      const pickerInstance = new picker.PickerBuilder()
        .addView(myFolders)
        .addView(sharedFolders)
        .addView(sharedDriveFolders)
        .enableFeature(picker.Feature.SUPPORT_DRIVES)
        .setOAuthToken(accessToken)
        .setDeveloperKey(apiKey)
        .setCallback(async (data: GooglePickerCallbackData) => {
          if (data.action === picker.Action.PICKED && data.docs?.[0]) {
            const folder = data.docs[0]
            console.log(`[Drive Save] Selected folder: ${folder.name} (${folder.id})`)

            try {
              // Generate file data
              setPhase('generating')
              const fileData = await getFileData()

              // Upload to Drive
              setPhase('uploading')
              const result = await uploadFileToDrive(
                accessToken,
                fileData.blob,
                fileData.fileName,
                fileData.mimeType,
                folder.id,
              )
              console.log(`[Drive Save] Uploaded: ${result.webViewLink}`)
              onSaved?.(result)
            } catch (err) {
              console.error('[Drive Save] Error:', err)
              onError?.(err instanceof Error ? err : new Error(String(err)))
            }
          }
          setPhase('idle')
        })
        .setTitle('בחר תיקיה ב-Google Drive')
        .setLocale('he')
        .build()

      pickerInstance.setVisible(true)
    } catch (err) {
      console.error('[Drive Save] Error:', err)
      onError?.(err instanceof Error ? err : new Error(String(err)))
      setPhase('idle')
    }
  }, [getAccessToken, apiKey, getFileData, onSaved, onError])

  if (!isConfigured) return null

  const isLoading = phase !== 'idle'
  const statusText = phase === 'picking'
    ? 'בוחר תיקיה...'
    : phase === 'generating'
      ? 'מייצר קובץ...'
      : phase === 'uploading'
        ? 'מעלה ל-Drive...'
        : (label || 'שמור ב-Drive')

  return (
    <Button
      variant="outline"
      onClick={handleClick}
      disabled={disabled || isLoading || !scriptsLoaded}
      className={`gap-2 ${className || ''}`}
    >
      <svg width="16" height="16" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
        <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066DA"/>
        <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0-1.2 4.5h27.5z" fill="#00AC47"/>
        <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 9.85z" fill="#EA4335"/>
        <path d="M43.65 25 57.4 1.2C56.05.4 54.5 0 52.85 0H34.45c-1.65 0-3.2.45-4.55 1.2z" fill="#00832D"/>
        <path d="m59.8 53h-32.3L13.75 76.8c1.35.8 2.9 1.2 4.55 1.2h22.55c1.65 0 3.2-.45 4.55-1.2z" fill="#2684FC"/>
        <path d="M73.4 26.5 60.65 4.5c-.8-1.4-1.95-2.5-3.3-3.3L43.6 25l16.15 28h27.5c0-1.55-.4-3.1-1.2-4.5z" fill="#FFBA00"/>
      </svg>
      {isLoading && (
        <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      )}
      {statusText}
    </Button>
  )
}

/**
 * Upload a file to Google Drive using the user's OAuth token.
 * Uses multipart upload via the Drive REST API v3.
 */
async function uploadFileToDrive(
  accessToken: string,
  blob: Blob,
  fileName: string,
  mimeType: string,
  folderId: string,
): Promise<{ fileId: string; webViewLink: string }> {
  const boundary = '-------drive-upload-boundary-' + Date.now()
  const metadata = JSON.stringify({
    name: fileName,
    mimeType,
    parents: [folderId],
  })

  // Build multipart/related body
  const bodyParts = [
    `--${boundary}\r\n`,
    'Content-Type: application/json; charset=UTF-8\r\n\r\n',
    metadata,
    `\r\n--${boundary}\r\n`,
    `Content-Type: ${mimeType}\r\n\r\n`,
  ]

  const arrayBuffer = await blob.arrayBuffer()
  const prefix = new TextEncoder().encode(bodyParts.join(''))
  const suffix = new TextEncoder().encode(`\r\n--${boundary}--`)

  // Merge all parts into a single Uint8Array
  const body = new Uint8Array(prefix.length + arrayBuffer.byteLength + suffix.length)
  body.set(prefix, 0)
  body.set(new Uint8Array(arrayBuffer), prefix.length)
  body.set(suffix, prefix.length + arrayBuffer.byteLength)

  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink&supportsAllDrives=true',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    if (response.status === 401) {
      throw new Error('פג תוקף ההרשאה. אנא התנתק והתחבר מחדש.')
    }
    if (response.status === 403) {
      throw new Error('אין הרשאה לתיקיה זו. בחר תיקיה אחרת.')
    }
    throw new Error(`Drive upload failed: ${response.status} ${errorText}`)
  }

  const result = await response.json()
  return {
    fileId: result.id,
    webViewLink: result.webViewLink || `https://drive.google.com/file/d/${result.id}/view`,
  }
}
