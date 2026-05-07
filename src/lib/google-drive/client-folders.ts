/**
 * Per-client Drive folder operations — replaces what Make.com used to do.
 *
 * The shared Drive layout (parent: shared drive 0ANr-zZZ-Hm3UUk9PVA):
 *   "בריפים ראשוניים"  (BRIEFS_SENT)        — brief was emailed; awaiting client
 *   "נסגר"            (BRIEFS_COMPLETED)   — client filled the brief
 *   "נפל"             (BRIEFS_FAILED)      — abandoned / never returned
 *   "ניהול לקוח"       (CLIENT_MANAGEMENT)  — parent for full per-client folders
 *
 * Lifecycle:
 *   1. Send brief link  → ensureClientBriefSentFolder({client}) creates one
 *      folder under BRIEFS_SENT and returns it. The wizard can drop the
 *      brief PDF or any attachments inside.
 *   2. Client submits brief → moveClientBriefFolder(folderId, 'completed')
 *      moves the folder to BRIEFS_COMPLETED, then ensureClientWorkspace()
 *      creates the full client workspace under CLIENT_MANAGEMENT with the
 *      7 standard subfolders (הסכמים / טבלאות שליטה / מדיה / ...).
 *   3. Brief expires / abandoned → moveClientBriefFolder(folderId, 'failed').
 *
 * All operations use the service account (createDriveClient) so they
 * succeed regardless of which user triggered them.
 */

import { createDriveClient } from './client'

// ─── Anchor folders (live IDs in the shared drive) ──────────
export const DRIVE_ANCHORS = {
  SHARED_DRIVE_ID:   '0ANr-zZZ-Hm3UUk9PVA',
  BRIEFS_SENT:       '1MdpY7bfwOtj9BknYfaWdJrs7HhKC1-Zj',
  BRIEFS_FAILED:     '1HXnIt91TiZmXtbuhHMY_YD6C_9ymNkS9',
  BRIEFS_COMPLETED:  '1hizczpDAHVFj5Et5G5Sv3t4--U1-BtKR',
  CLIENT_MANAGEMENT: '1HsFIUS9jw6hAjFYX969vCPeR1nBUZdLO',
} as const

// 7 standard subfolders that get created inside every per-client workspace.
// Order matches what the team uses in legacy clients (Hebrew alphabetical).
export const CLIENT_SUBFOLDERS = [
  'הסכמים',
  'טבלאות שליטה',
  'מדיה',
  'משפיענים',
  'סושיאל',
  'תוכן מהלקוח',
  'קריאטיב',
] as const

const FOLDER_MIME = 'application/vnd.google-apps.folder'

/* ───────────────── Generic helpers ───────────────── */

/** Create an empty folder under the given parent. Returns id + view link. */
export async function createFolder(params: {
  name: string
  parentId: string
}): Promise<{ id: string; webViewLink: string; name: string }> {
  const drive = await createDriveClient()
  const res = await drive.files.create({
    requestBody: {
      name: params.name,
      mimeType: FOLDER_MIME,
      parents: [params.parentId],
    },
    fields: 'id, name, webViewLink',
    supportsAllDrives: true,
  })
  return {
    id: res.data.id!,
    name: res.data.name || params.name,
    webViewLink: res.data.webViewLink || `https://drive.google.com/drive/folders/${res.data.id}`,
  }
}

/**
 * Move a file or folder to a new parent. Drive doesn't have a native "move"
 * — you swap parents via files.update with addParents + removeParents.
 */
export async function moveItem(params: {
  fileId: string
  newParentId: string
}): Promise<void> {
  const drive = await createDriveClient()
  // Fetch current parents so we can detach them.
  const cur = await drive.files.get({
    fileId: params.fileId,
    fields: 'parents',
    supportsAllDrives: true,
  })
  const oldParents = (cur.data.parents || []).join(',')
  await drive.files.update({
    fileId: params.fileId,
    addParents: params.newParentId,
    removeParents: oldParents || undefined,
    fields: 'id, parents',
    supportsAllDrives: true,
  })
}

/**
 * Find a child folder by exact name under a given parent. Returns null when
 * not found. Used to skip duplicate creates ("already have a folder for this
 * client" guard).
 */
export async function findFolderByName(
  parentId: string,
  name: string,
): Promise<{ id: string; webViewLink: string } | null> {
  const drive = await createDriveClient()
  const safeName = name.replace(/'/g, "\\'")
  const res = await drive.files.list({
    q: `'${parentId}' in parents and trashed=false and mimeType='${FOLDER_MIME}' and name='${safeName}'`,
    fields: 'files(id, name, webViewLink)',
    pageSize: 5,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })
  const f = res.data.files?.[0]
  if (!f?.id) return null
  return {
    id: f.id,
    webViewLink: f.webViewLink || `https://drive.google.com/drive/folders/${f.id}`,
  }
}

/* ───────────────── Brief lifecycle ───────────────── */

/**
 * Get-or-create the per-client folder under "בריפים ראשוניים". Idempotent:
 * if a folder with the same client name already exists there, returns it.
 */
export async function ensureClientBriefSentFolder(params: {
  clientName: string
}): Promise<{ id: string; webViewLink: string; created: boolean }> {
  const folderName = sanitizeClientName(params.clientName)
  const existing = await findFolderByName(DRIVE_ANCHORS.BRIEFS_SENT, folderName)
  if (existing) return { ...existing, created: false }
  const created = await createFolder({
    name: folderName,
    parentId: DRIVE_ANCHORS.BRIEFS_SENT,
  })
  return { id: created.id, webViewLink: created.webViewLink, created: true }
}

/**
 * Move a per-client folder between the three brief states (sent → completed,
 * sent → failed). Returns true on success. Non-fatal — logs and returns
 * false if the folder doesn't exist.
 */
export async function moveClientBriefFolder(params: {
  folderId: string
  to: 'completed' | 'failed'
}): Promise<boolean> {
  const target =
    params.to === 'completed'
      ? DRIVE_ANCHORS.BRIEFS_COMPLETED
      : DRIVE_ANCHORS.BRIEFS_FAILED
  try {
    await moveItem({ fileId: params.folderId, newParentId: target })
    return true
  } catch (e) {
    console.error('[Drive] moveClientBriefFolder failed:', e instanceof Error ? e.message : e)
    return false
  }
}

/**
 * Create the full per-client workspace under "ניהול לקוח" with the 7
 * standard subfolders. Idempotent: if a workspace with the same name
 * already exists, returns it without re-creating.
 *
 * Returns the workspace folder id + a map of subfolder names → ids.
 */
export async function ensureClientWorkspace(params: {
  clientName: string
}): Promise<{
  workspaceId: string
  webViewLink: string
  created: boolean
  subfolders: Record<string, { id: string; webViewLink: string }>
}> {
  const folderName = sanitizeClientName(params.clientName)
  const existing = await findFolderByName(DRIVE_ANCHORS.CLIENT_MANAGEMENT, folderName)
  if (existing) {
    // Existing workspace — list its current subfolders so callers get the
    // same shape regardless of whether we just created it.
    const subs = await listSubfolders(existing.id)
    return {
      workspaceId: existing.id,
      webViewLink: existing.webViewLink,
      created: false,
      subfolders: subs,
    }
  }
  const ws = await createFolder({
    name: folderName,
    parentId: DRIVE_ANCHORS.CLIENT_MANAGEMENT,
  })
  // Create the 7 standard subfolders sequentially. Drive doesn't rate-limit
  // small creates and serial keeps logs readable.
  const subfolders: Record<string, { id: string; webViewLink: string }> = {}
  for (const name of CLIENT_SUBFOLDERS) {
    try {
      const sub = await createFolder({ name, parentId: ws.id })
      subfolders[name] = { id: sub.id, webViewLink: sub.webViewLink }
    } catch (e) {
      console.warn(`[Drive] failed to create subfolder "${name}" in ${ws.id}:`, e instanceof Error ? e.message : e)
    }
  }
  return {
    workspaceId: ws.id,
    webViewLink: ws.webViewLink,
    created: true,
    subfolders,
  }
}

async function listSubfolders(
  parentId: string,
): Promise<Record<string, { id: string; webViewLink: string }>> {
  const drive = await createDriveClient()
  const res = await drive.files.list({
    q: `'${parentId}' in parents and trashed=false and mimeType='${FOLDER_MIME}'`,
    fields: 'files(id, name, webViewLink)',
    pageSize: 50,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })
  const out: Record<string, { id: string; webViewLink: string }> = {}
  for (const f of res.data.files || []) {
    if (f.name && f.id) {
      out[f.name] = {
        id: f.id,
        webViewLink: f.webViewLink || `https://drive.google.com/drive/folders/${f.id}`,
      }
    }
  }
  return out
}

/** Strip Drive-unfriendly chars from a client name. */
function sanitizeClientName(raw: string): string {
  return raw
    .trim()
    .replace(/[\\/\0]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 200) || 'לקוח ללא שם'
}
