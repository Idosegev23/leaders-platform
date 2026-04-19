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





