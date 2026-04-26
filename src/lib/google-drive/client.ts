/**
 * Google Drive API Integration
 * 
 * This module handles uploading PDFs to a shared Google Drive folder.
 * Requires Google OAuth credentials and Drive API setup.
 */

import { google } from 'googleapis'

// Note: For server-side usage, you'll need to set up a service account
// or use OAuth2 with user consent flow.

interface DriveUploadOptions {
  fileName: string
  mimeType: string
  buffer: Buffer
  folderId?: string
}

interface DriveUploadResult {
  fileId: string
  webViewLink: string
  webContentLink: string
}

/**
 * Create Google Drive client with service account
 * 
 * For this to work, you need:
 * 1. Create a service account in Google Cloud Console
 * 2. Download the JSON key file
 * 3. Share your target folder with the service account email
 * 4. Set GOOGLE_SERVICE_ACCOUNT_KEY environment variable
 */
export async function createDriveClient() {
  const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  
  if (!credentials) {
    throw new Error('Google Service Account credentials not configured')
  }

  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(credentials),
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  })

  return google.drive({ version: 'v3', auth })
}

/**
 * Upload a file to Google Drive
 */
export async function uploadToGoogleDrive(
  options: DriveUploadOptions
): Promise<DriveUploadResult> {
  const drive = await createDriveClient()
  const folderId = options.folderId || process.env.GOOGLE_DRIVE_FOLDER_ID

  if (!folderId) {
    throw new Error('Google Drive folder ID not configured')
  }

  // Create file metadata
  const fileMetadata = {
    name: options.fileName,
    parents: [folderId],
  }

  // Upload file
  const { Readable } = await import('stream')
  const stream = new Readable()
  stream.push(options.buffer)
  stream.push(null)

  const response = await drive.files.create({
    requestBody: fileMetadata,
    media: {
      mimeType: options.mimeType,
      body: stream,
    },
    fields: 'id, webViewLink, webContentLink',
  })

  // Make file accessible with link
  await drive.permissions.create({
    fileId: response.data.id!,
    requestBody: {
      role: 'reader',
      type: 'anyone',
    },
  })

  return {
    fileId: response.data.id!,
    webViewLink: response.data.webViewLink!,
    webContentLink: response.data.webContentLink!,
  }
}

/**
 * Delete a file from Google Drive
 */
export async function deleteFromGoogleDrive(fileId: string): Promise<void> {
  const drive = await createDriveClient()
  await drive.files.delete({ fileId })
}

/**
 * Extract a Drive folder id from any of the inputs the user might paste
 * — a folder URL, "open=...&id=..." link, or the bare id itself.
 */
export function parseDriveFolderId(input: string): string | null {
  if (!input) return null
  const trimmed = input.trim()
  // /folders/{id}
  const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]{10,})/)
  if (folderMatch) return folderMatch[1]
  // ?id={id}
  const idMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]{10,})/)
  if (idMatch) return idMatch[1]
  // bare id
  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) return trimmed
  return null
}

/**
 * Verify the service account can write to the folder.
 */
export async function verifyDriveFolderWritable(
  folderId: string,
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  try {
    const drive = await createDriveClient()
    const res = await drive.files.get({
      fileId: folderId,
      fields: 'id, name, mimeType, capabilities',
      supportsAllDrives: true,
    })
    if (res.data.mimeType !== 'application/vnd.google-apps.folder') {
      return { ok: false, error: 'הקישור לא מצביע על תיקיה' }
    }
    if (res.data.capabilities?.canAddChildren === false) {
      return {
        ok: false,
        error:
          'אין הרשאת כתיבה. ודא שהתיקיה משותפת עם ldrsagent@ldrsgroup-484815.iam.gserviceaccount.com (כעורך).',
      }
    }
    return { ok: true, name: res.data.name ?? 'תיקיה' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('404') || msg.includes('not found')) {
      return {
        ok: false,
        error:
          'התיקיה לא נמצאה או שאין לה גישה. שתף את התיקיה עם ldrsagent@ldrsgroup-484815.iam.gserviceaccount.com (כעורך).',
      }
    }
    return { ok: false, error: msg }
  }
}

/**
 * Upload a buffer to a specific folder. Returns id + viewable link.
 */
export async function uploadBufferToDriveFolder(params: {
  folderId: string
  fileName: string
  mimeType: string
  buffer: Buffer
  shareWithDomain?: boolean
}): Promise<{ id: string; viewLink: string; downloadLink: string }> {
  const drive = await createDriveClient()
  const { Readable } = await import('stream')
  const stream = new Readable()
  stream.push(params.buffer)
  stream.push(null)

  const response = await drive.files.create({
    requestBody: {
      name: params.fileName,
      parents: [params.folderId],
    },
    media: {
      mimeType: params.mimeType,
      body: stream,
    },
    fields: 'id, webViewLink, webContentLink',
    supportsAllDrives: true,
  })

  // Make readable by anyone with the link (so emailed PDFs open without
  // requiring the recipient to have a Workspace account).
  await drive.permissions.create({
    fileId: response.data.id!,
    requestBody: { role: 'reader', type: 'anyone' },
    supportsAllDrives: true,
  })

  return {
    id: response.data.id!,
    viewLink: response.data.webViewLink ?? '',
    downloadLink: response.data.webContentLink ?? '',
  }
}

/**
 * Read the bytes of a file we previously uploaded.
 */
export async function downloadDriveFileBytes(fileId: string): Promise<Buffer> {
  const drive = await createDriveClient()
  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' },
  )
  return Buffer.from(res.data as ArrayBuffer)
}

/**
 * Upload a buffer to Drive using a USER OAuth access_token (not the
 * service account). Lets the user write to any folder they own without
 * needing to share it with a service account first.
 *
 * Uses the multipart upload endpoint directly so we don't have to
 * create a googleapis client per call.
 */
export async function uploadBufferToDriveAsUser(params: {
  accessToken: string
  folderId: string
  fileName: string
  mimeType: string
  buffer: Buffer
}): Promise<{ id: string; viewLink: string }> {
  const boundary = `----leaders${Date.now()}`
  const metadata = {
    name: params.fileName,
    parents: [params.folderId],
    mimeType: params.mimeType,
  }

  // Build multipart/related body manually — pure Buffer (works in node).
  const partHeader = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${params.mimeType}\r\n\r\n`,
    'utf-8',
  )
  const partFooter = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8')
  const body = Buffer.concat([partHeader, params.buffer, partFooter])

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': String(body.length),
      },
      body,
    },
  )

  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => '')
    throw new Error(`Drive upload (user) ${uploadRes.status}: ${errText.slice(0, 300)}`)
  }

  const data = (await uploadRes.json()) as { id: string; webViewLink?: string }

  // Make readable by anyone with the link so the recipient can preview
  // the PDF inside the signature page without needing Google Workspace.
  await fetch(`https://www.googleapis.com/drive/v3/files/${data.id}/permissions?supportsAllDrives=true`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  }).catch((e) => console.warn('[Drive permissions] add failed:', e))

  return {
    id: data.id,
    viewLink: data.webViewLink ?? `https://drive.google.com/file/d/${data.id}/view`,
  }
}

/**
 * List files in the shared folder
 */
export async function listDriveFiles(folderId?: string): Promise<Array<{
  id: string
  name: string
  mimeType: string
  createdTime: string
}>> {
  const drive = await createDriveClient()
  const targetFolderId = folderId || process.env.GOOGLE_DRIVE_FOLDER_ID

  if (!targetFolderId) {
    throw new Error('Google Drive folder ID not configured')
  }

  const response = await drive.files.list({
    q: `'${targetFolderId}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType, createdTime)',
    orderBy: 'createdTime desc',
  })

  return (response.data.files || []).map(file => ({
    id: file.id!,
    name: file.name!,
    mimeType: file.mimeType!,
    createdTime: file.createdTime!,
  }))
}





