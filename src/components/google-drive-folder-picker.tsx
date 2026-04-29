'use client'

import { useCallback, useState } from 'react'
import { useGooglePicker } from '@/hooks/use-google-picker'
import type { GooglePickerCallbackData } from '@/hooks/use-google-picker'

type Props = {
  onPicked: (folder: { id: string; name: string }) => void
  disabled?: boolean
  buttonLabel?: string
}

/**
 * Folder-only Google Drive picker. Returns just `{id, name}` for the
 * folder the user selected. Uses the user's own OAuth token from the
 * Supabase session (no service account involvement at all).
 */
export default function GoogleDriveFolderPicker({ onPicked, disabled, buttonLabel }: Props) {
  const { isConfigured, scriptsLoaded, apiKey, getAccessToken } = useGooglePicker()
  const [loading, setLoading] = useState(false)

  const open = useCallback(async () => {
    if (!window.google?.picker) return
    setLoading(true)
    try {
      const accessToken = await getAccessToken()
      if (!accessToken) {
        console.warn('[Drive Folder Picker] No provider token — firing AuthGuard reauth event')
        const { dispatchReauthRequired } = await import('@/components/auth/AuthGuard')
        dispatchReauthRequired('drive-folder-picker')
        setLoading(false)
        return
      }
      const picker = window.google.picker!

      const myDriveFolders = new picker.DocsView(picker.ViewId.FOLDERS)
      myDriveFolders.setSelectFolderEnabled(true)
      myDriveFolders.setMimeTypes('application/vnd.google-apps.folder')

      const sharedFolders = new picker.DocsView(picker.ViewId.FOLDERS)
      sharedFolders.setSelectFolderEnabled(true)
      sharedFolders.setMimeTypes('application/vnd.google-apps.folder')
      sharedFolders.setOwnedByMe(false)

      const sharedDrives = new picker.DocsView(picker.ViewId.FOLDERS)
      sharedDrives.setSelectFolderEnabled(true)
      sharedDrives.setMimeTypes('application/vnd.google-apps.folder')
      sharedDrives.setEnableDrives(true)

      const instance = new picker.PickerBuilder()
        .addView(myDriveFolders)
        .addView(sharedFolders)
        .addView(sharedDrives)
        .enableFeature(picker.Feature.SUPPORT_DRIVES)
        .setOAuthToken(accessToken)
        .setDeveloperKey(apiKey)
        .setCallback((data: GooglePickerCallbackData) => {
          if (data.action === picker.Action.PICKED && data.docs?.[0]) {
            const d = data.docs[0]
            onPicked({ id: d.id, name: d.name })
          }
          setLoading(false)
        })
        .setTitle('בחר תיקיה ב-Google Drive')
        .setLocale('he')
        .build()

      instance.setVisible(true)
    } catch (err) {
      console.error('[GoogleDriveFolderPicker]', err)
      setLoading(false)
    }
  }, [getAccessToken, apiKey, onPicked])

  if (!isConfigured) {
    return (
      <div className="text-[11px] text-amber-300 font-rubik tracking-[0.04em]">
        NEXT_PUBLIC_GOOGLE_API_KEY חסר — לא ניתן לפתוח את ה-Picker.
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={disabled || loading || !scriptsLoaded}
      className="inline-flex items-center gap-2 rounded-sm ring-1 ring-white/15 hover:ring-white/35 px-3 py-2.5 text-[13px] text-white/80 hover:text-white transition-colors disabled:opacity-50"
    >
      <svg width="16" height="16" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
        <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066DA"/>
        <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0-1.2 4.5h27.5z" fill="#00AC47"/>
        <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 9.85z" fill="#EA4335"/>
        <path d="M43.65 25 57.4 1.2C56.05.4 54.5 0 52.85 0H34.45c-1.65 0-3.2.45-4.55 1.2z" fill="#00832D"/>
        <path d="m59.8 53h-32.3L13.75 76.8c1.35.8 2.9 1.2 4.55 1.2h22.55c1.65 0 3.2-.45 4.55-1.2z" fill="#2684FC"/>
        <path d="M73.4 26.5 60.65 4.5c-.8-1.4-1.95-2.5-3.3-3.3L43.6 25l16.15 28h27.5c0-1.55-.4-3.1-1.2-4.5z" fill="#FFBA00"/>
      </svg>
      {loading ? 'פותח…' : (buttonLabel || 'בחר תיקיה ב-Drive')}
    </button>
  )
}
