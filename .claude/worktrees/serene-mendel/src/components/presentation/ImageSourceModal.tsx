'use client'

import React, { useState, useRef, useCallback, useEffect } from 'react'
import type { DesignSystem } from '@/types/presentation'

type Tab = 'upload' | 'url' | 'ai'

interface ImageSourceModalProps {
  isOpen: boolean
  onClose: () => void
  onImageSelected: (url: string) => void
  designSystem: DesignSystem
  documentId: string
  slideLabel?: string
  initialTab?: Tab
}

export default function ImageSourceModal({
  isOpen,
  onClose,
  onImageSelected,
  designSystem,
  documentId,
  slideLabel,
  initialTab,
}: ImageSourceModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>(initialTab || 'upload')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset tab when modal opens with a specific tab
  useEffect(() => {
    if (isOpen && initialTab) setActiveTab(initialTab)
  }, [isOpen, initialTab])

  if (!isOpen) return null

  const handleSelect = (url: string) => {
    onImageSelected(url)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm" dir="rtl">
      <div className="bg-[#12121f] border border-white/10 rounded-2xl w-[540px] max-h-[80vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <h3 className="text-white text-sm font-medium">החלפת תמונה</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors p-1"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/5 px-5">
          {([
            { key: 'upload' as Tab, label: '📁 העלאה' },
            { key: 'url' as Tab, label: '🔗 URL' },
            { key: 'ai' as Tab, label: '✨ יצירה עם AI' },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { setActiveTab(key); setError(null) }}
              className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                activeTab === key
                  ? 'border-purple-500 text-white'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-300 text-xs">
              {error}
            </div>
          )}

          {activeTab === 'upload' && (
            <UploadTab
              loading={loading}
              setLoading={setLoading}
              setError={setError}
              onImageSelected={handleSelect}
            />
          )}

          {activeTab === 'url' && (
            <UrlTab
              onImageSelected={handleSelect}
            />
          )}

          {activeTab === 'ai' && (
            <AiTab
              loading={loading}
              setLoading={setLoading}
              setError={setError}
              onImageSelected={handleSelect}
              designSystem={designSystem}
              documentId={documentId}
              slideLabel={slideLabel}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Upload Tab ──────────────────────────────────────

function UploadTab({ loading, setLoading, setError, onImageSelected }: {
  loading: boolean
  setLoading: (v: boolean) => void
  setError: (v: string | null) => void
  onImageSelected: (url: string) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const uploadFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('יש לבחור קובץ תמונה בלבד')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('גודל הקובץ חייב להיות עד 10MB')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('fieldId', 'slide-image')

      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const data = await res.json()

      if (!res.ok || !data.url) {
        throw new Error(data.error || 'שגיאה בהעלאה')
      }

      onImageSelected(data.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בהעלאה')
    } finally {
      setLoading(false)
    }
  }, [setLoading, setError, onImageSelected])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) uploadFile(file)
  }, [uploadFile])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
  }, [uploadFile])

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
          isDragging
            ? 'border-purple-500 bg-purple-500/10'
            : 'border-white/10 hover:border-white/20 bg-white/[0.02]'
        }`}
      >
        {loading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-400 text-sm">מעלה תמונה...</p>
          </div>
        ) : (
          <>
            <div className="text-4xl mb-3">📁</div>
            <p className="text-gray-300 text-sm mb-1">גרור תמונה לכאן</p>
            <p className="text-gray-500 text-xs">או לחץ לבחירת קובץ</p>
            <p className="text-gray-600 text-[10px] mt-3">PNG, JPG, WebP — עד 10MB</p>
          </>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  )
}

// ─── URL Tab ─────────────────────────────────────────

function UrlTab({ onImageSelected }: {
  onImageSelected: (url: string) => void
}) {
  const [url, setUrl] = useState('')
  const [previewError, setPreviewError] = useState(false)

  const isValid = url.startsWith('http://') || url.startsWith('https://')

  return (
    <div className="space-y-4">
      <div>
        <label className="text-gray-400 text-xs block mb-1.5">כתובת URL של תמונה</label>
        <input
          type="url"
          value={url}
          onChange={(e) => { setUrl(e.target.value); setPreviewError(false) }}
          placeholder="https://example.com/image.jpg"
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-white/30 font-mono"
          dir="ltr"
        />
      </div>

      {isValid && !previewError && (
        <div className="rounded-lg overflow-hidden bg-black/30 border border-white/5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt="תצוגה מקדימה"
            className="w-full h-48 object-contain"
            onError={() => setPreviewError(true)}
          />
        </div>
      )}

      {previewError && (
        <p className="text-yellow-400 text-xs">לא ניתן לטעון תצוגה מקדימה — ניתן להמשיך בכל זאת</p>
      )}

      <button
        onClick={() => onImageSelected(url)}
        disabled={!isValid}
        className={`w-full py-2.5 rounded-lg text-sm font-medium transition-colors ${
          isValid
            ? 'bg-purple-600 text-white hover:bg-purple-500'
            : 'bg-white/5 text-gray-600 cursor-not-allowed'
        }`}
      >
        השתמש בתמונה
      </button>
    </div>
  )
}

// ─── AI Tab ──────────────────────────────────────────

function AiTab({ loading, setLoading, setError, onImageSelected, designSystem, documentId, slideLabel }: {
  loading: boolean
  setLoading: (v: boolean) => void
  setError: (v: string | null) => void
  onImageSelected: (url: string) => void
  designSystem: DesignSystem
  documentId: string
  slideLabel?: string
}) {
  const [prompt, setPrompt] = useState('')
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null)

  const contextChips = [
    slideLabel && `שקף: ${slideLabel}`,
    `צבע ראשי: ${designSystem.colors.primary}`,
    `סגנון: מקצועי`,
  ].filter(Boolean)

  const handleGenerate = async () => {
    if (!prompt.trim()) return
    setLoading(true)
    setError(null)
    setGeneratedUrl(null)

    try {
      const fullPrompt = `Professional presentation image. ${prompt}. Style: modern, clean, corporate. Colors inspired by ${designSystem.colors.primary} and ${designSystem.colors.secondary}. High quality, 16:9 aspect ratio.`

      const res = await fetch('/api/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: fullPrompt, documentId }),
      })
      const data = await res.json()

      if (!res.ok || !data.imageUrl) {
        throw new Error(data.error || 'שגיאה ביצירת תמונה')
      }

      setGeneratedUrl(data.imageUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה ביצירת תמונה')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Context chips */}
      <div className="flex flex-wrap gap-1.5">
        {contextChips.map((chip, i) => (
          <span
            key={i}
            className="px-2 py-1 bg-white/5 border border-white/10 rounded-full text-gray-500 text-[10px]"
          >
            {chip}
          </span>
        ))}
      </div>

      {/* Prompt */}
      <div>
        <label className="text-gray-400 text-xs block mb-1.5">תאר את התמונה שאתה רוצה</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="לדוגמה: תמונת רקע עם גראדיאנט כחול-סגול ואלמנטים גיאומטריים מודרניים"
          rows={3}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-white/30 resize-none"
          dir="rtl"
        />
      </div>

      {/* Quick prompts */}
      <div className="flex flex-wrap gap-1.5">
        {[
          'רקע אבסטרקטי מודרני',
          'נוף עירוני מקצועי',
          'אלמנטים גיאומטריים',
          'טכנולוגיה ודיגיטל',
        ].map((q) => (
          <button
            key={q}
            onClick={() => setPrompt(q)}
            className="px-2.5 py-1.5 bg-white/5 border border-white/10 rounded-full text-gray-400 text-[10px] hover:bg-white/10 hover:text-gray-300 transition-colors"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={loading || !prompt.trim()}
        className={`w-full py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
          loading || !prompt.trim()
            ? 'bg-white/5 text-gray-600 cursor-not-allowed'
            : 'bg-purple-600 text-white hover:bg-purple-500'
        }`}
      >
        {loading ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <span>יוצר תמונה...</span>
          </>
        ) : (
          <>
            <span>✨</span>
            <span>צור תמונה</span>
          </>
        )}
      </button>

      {/* Result preview */}
      {generatedUrl && (
        <div className="space-y-3">
          <div className="rounded-lg overflow-hidden bg-black/30 border border-white/5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={generatedUrl}
              alt="תמונה שנוצרה"
              className="w-full h-48 object-contain"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onImageSelected(generatedUrl)}
              className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-500 transition-colors"
            >
              השתמש בתמונה
            </button>
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="px-4 py-2 bg-white/5 border border-white/10 text-gray-300 rounded-lg text-sm hover:bg-white/10 transition-colors"
            >
              נסה שוב
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
