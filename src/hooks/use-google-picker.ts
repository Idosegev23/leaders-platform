'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY || ''

// ─── Google Picker API type declarations ──────────────────────
declare global {
  interface Window {
    google?: {
      picker?: {
        PickerBuilder: new () => GooglePickerBuilder
        ViewId: {
          DOCS: string
          FOLDERS: string
          RECENTLY_PICKED: string
        }
        Action: { PICKED: string; CANCEL: string }
        Feature: {
          SUPPORT_DRIVES: unknown
          MULTISELECT_ENABLED: unknown
        }
        DocsView: new (viewId: string) => GoogleDocsView
      }
    }
    gapi?: {
      load: (api: string, callback: () => void) => void
    }
  }
}

export interface GooglePickerBuilder {
  addView: (view: unknown) => GooglePickerBuilder
  enableFeature: (feature: unknown) => GooglePickerBuilder
  setOAuthToken: (token: string) => GooglePickerBuilder
  setDeveloperKey: (key: string) => GooglePickerBuilder
  setCallback: (callback: (data: GooglePickerCallbackData) => void) => GooglePickerBuilder
  setTitle: (title: string) => GooglePickerBuilder
  setLocale: (locale: string) => GooglePickerBuilder
  build: () => { setVisible: (visible: boolean) => void }
}

export interface GoogleDocsView {
  setMimeTypes: (types: string) => unknown
  setIncludeFolders: (v: boolean) => unknown
  setEnableDrives: (v: boolean) => unknown
  setOwnedByMe: (v: boolean) => unknown
  setSelectFolderEnabled: (v: boolean) => unknown
}

export interface GooglePickerCallbackData {
  action: string
  docs?: Array<{
    id: string
    name: string
    mimeType: string
    url: string
  }>
}

// ─── Singleton script loading ─────────────────────────────────

function loadScript(src: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById(id)) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.id = id
    script.src = src
    script.onload = () => resolve()
    script.onerror = reject
    document.body.appendChild(script)
  })
}

let pickerReady = false
const pickerReadyCallbacks: (() => void)[] = []

function ensurePickerLoaded(callback: () => void) {
  if (pickerReady) {
    callback()
    return
  }
  pickerReadyCallbacks.push(callback)
  if (pickerReadyCallbacks.length === 1) {
    loadScript('https://apis.google.com/js/api.js', 'google-api')
      .then(() => {
        if (window.gapi) {
          window.gapi.load('picker', () => {
            pickerReady = true
            pickerReadyCallbacks.forEach(cb => cb())
            pickerReadyCallbacks.length = 0
          })
        }
      })
      .catch((err) => {
        console.error('[Google Picker] Failed to load scripts:', err)
      })
  }
}

// ─── Hook ─────────────────────────────────────────────────────

export function useGooglePicker() {
  const [scriptsLoaded, setScriptsLoaded] = useState(pickerReady)
  const isConfigured = Boolean(GOOGLE_API_KEY)

  useEffect(() => {
    if (!isConfigured) return
    ensurePickerLoaded(() => setScriptsLoaded(true))
  }, [isConfigured])

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return session?.provider_token || null
  }, [])

  return {
    isConfigured,
    scriptsLoaded,
    apiKey: GOOGLE_API_KEY,
    getAccessToken,
  }
}
