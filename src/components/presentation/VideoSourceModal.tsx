'use client'

import React, { useState, useRef } from 'react'
import { detectVideoProvider, extractYouTubeId } from '@/types/presentation'
import type { VideoProvider } from '@/types/presentation'

interface VideoSourceModalProps {
  onSelect: (src: string, provider: VideoProvider, posterImage?: string) => void
  onClose: () => void
}

type Tab = 'upload' | 'url' | 'embed'

export default function VideoSourceModal({ onSelect, onClose }: VideoSourceModalProps) {
  const [tab, setTab] = useState<Tab>('url')
  const [url, setUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const handleUrlSubmit = () => {
    if (!url.trim()) return
    const provider = detectVideoProvider(url.trim())
    const ytId = provider === 'youtube' ? extractYouTubeId(url.trim()) : null
    const poster = ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : undefined
    onSelect(url.trim(), provider, poster)
  }

  const handleFileUpload = async (file: File) => {
    if (!file.type.startsWith('video/')) {
      setError('נא לבחור קובץ וידאו')
      return
    }
    if (file.size > 100 * 1024 * 1024) {
      setError('קובץ גדול מדי (מקסימום 100MB)')
      return
    }

    setUploading(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/upload/video', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Upload failed')
      }

      const { url: videoUrl } = await res.json()
      onSelect(videoUrl, 'storage')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בהעלאה')
    } finally {
      setUploading(false)
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'url', label: 'קישור' },
    { key: 'embed', label: 'YouTube / Vimeo' },
    { key: 'upload', label: 'העלאת קובץ' },
  ]

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-[#1a1a2e] border border-white/10 rounded-2xl w-[480px] max-h-[80vh] overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <h3 className="text-white font-semibold text-sm">הוסף וידאו</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/5 px-5">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setError('') }}
              className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? 'text-blue-400 border-blue-400'
                  : 'text-gray-400 border-transparent hover:text-gray-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-lg px-3 py-2">{error}</div>
          )}

          {tab === 'url' && (
            <>
              <p className="text-gray-400 text-xs">הדבק קישור ישיר לקובץ וידאו (MP4, WebM)</p>
              <input
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://example.com/video.mp4"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50"
                dir="ltr"
                onKeyDown={e => e.key === 'Enter' && handleUrlSubmit()}
              />
              <button
                onClick={handleUrlSubmit}
                disabled={!url.trim()}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded-lg py-2.5 transition-colors"
              >
                הוסף וידאו
              </button>
            </>
          )}

          {tab === 'embed' && (
            <>
              <p className="text-gray-400 text-xs">הדבק קישור YouTube או Vimeo</p>
              <input
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50"
                dir="ltr"
                onKeyDown={e => e.key === 'Enter' && handleUrlSubmit()}
              />
              {url && extractYouTubeId(url) && (
                <div className="rounded-lg overflow-hidden bg-black aspect-video">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://img.youtube.com/vi/${extractYouTubeId(url)}/hqdefault.jpg`}
                    alt="preview"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <button
                onClick={handleUrlSubmit}
                disabled={!url.trim()}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded-lg py-2.5 transition-colors"
              >
                הוסף וידאו
              </button>
            </>
          )}

          {tab === 'upload' && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) handleFileUpload(file)
                }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="w-full border-2 border-dashed border-white/10 hover:border-blue-500/30 rounded-xl py-10 flex flex-col items-center gap-3 transition-colors"
              >
                {uploading ? (
                  <>
                    <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                    <span className="text-gray-300 text-sm">מעלה...</span>
                  </>
                ) : (
                  <>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="1.5">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <span className="text-gray-400 text-sm">לחץ לבחירת קובץ וידאו</span>
                    <span className="text-gray-600 text-xs">MP4, WebM — עד 100MB</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
