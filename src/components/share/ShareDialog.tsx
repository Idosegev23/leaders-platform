'use client'

import React, { useState, useEffect, useCallback } from 'react'
import type { ViewerConfig, ShareData, ShareAnalyticsSummary, CtaConfig } from '@/types/share'
import { DEFAULT_VIEWER_CONFIG } from '@/types/share'

interface ShareDialogProps {
  isOpen: boolean
  onClose: () => void
  documentId: string
}

export default function ShareDialog({ isOpen, onClose, documentId }: ShareDialogProps) {
  const [loading, setLoading] = useState(false)
  const [share, setShare] = useState<{ shareToken: string; shareId: string; shareUrl: string } | null>(null)
  const [config, setConfig] = useState<ViewerConfig>(DEFAULT_VIEWER_CONFIG)
  const [analytics, setAnalytics] = useState<ShareAnalyticsSummary | null>(null)
  const [copied, setCopied] = useState(false)
  const [tab, setTab] = useState<'settings' | 'analytics'>('settings')

  // Check if share exists
  const loadExistingShare = useCallback(async () => {
    try {
      // We'll create on demand, but check if already exists by creating
      // The POST endpoint handles deduplication
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    if (isOpen) loadExistingShare()
  }, [isOpen, loadExistingShare])

  const createOrUpdateShare = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/shares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId, viewerConfig: config }),
      })
      const data = await res.json()
      if (res.ok) {
        const shareData = { shareToken: data.shareToken, shareId: data.shareId, shareUrl: data.shareUrl }
        setShare(shareData)
        // Auto-copy link
        const url = `${window.location.origin}${shareData.shareUrl}`
        navigator.clipboard.writeText(url).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 3000)
        }).catch(() => {})
      }
    } catch (err) {
      console.error('Error creating share:', err)
    }
    setLoading(false)
  }

  const updateConfig = async (updates: Partial<ViewerConfig>) => {
    const newConfig = { ...config, ...updates }
    setConfig(newConfig)

    if (share) {
      fetch(`/api/shares/${share.shareId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ viewerConfig: updates }),
      }).catch(() => {})
    }
  }

  const loadAnalytics = async () => {
    if (!share) return
    try {
      const res = await fetch(`/api/shares/${share.shareId}/analytics`)
      if (res.ok) {
        const data = await res.json()
        setAnalytics(data)
      }
    } catch {
      // ignore
    }
  }

  const copyLink = () => {
    if (!share) return
    const url = `${window.location.origin}${share.shareUrl}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const deactivateShare = async () => {
    if (!share) return
    await fetch(`/api/shares/${share.shareId}`, { method: 'DELETE' })
    setShare(null)
  }

  if (!isOpen) return null

  const fullUrl = share ? `${typeof window !== 'undefined' ? window.location.origin : ''}${share.shareUrl}` : ''

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-[9998]" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center z-[9999] p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="bg-[#12121a] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl" dir="rtl">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
            <h2 className="text-white font-medium text-sm">שיתוף מצגת</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-white p-1">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
            {!share ? (
              // No share yet — create
              <div className="text-center py-6">
                <div className="text-gray-400 text-sm mb-4">צור קישור שיתוף ציבורי למצגת</div>
                <button
                  onClick={createOrUpdateShare}
                  disabled={loading}
                  className="px-6 py-2.5 bg-white text-black font-medium rounded-lg hover:bg-gray-200 transition-colors text-sm disabled:opacity-50"
                >
                  {loading ? 'יוצר...' : 'צור קישור שיתוף'}
                </button>
              </div>
            ) : (
              <>
                {/* Share link */}
                <div className={`rounded-xl p-4 transition-all ${copied ? 'bg-green-500/10 ring-1 ring-green-500/30' : 'bg-white/5'}`}>
                  {copied && (
                    <div className="flex items-center gap-2 mb-2 text-green-400 text-xs font-medium">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                      הקישור הועתק ללוח!
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={fullUrl}
                      onClick={(e) => { (e.target as HTMLInputElement).select(); copyLink() }}
                      className="flex-1 bg-white/5 rounded-lg px-3 py-2 text-white/80 text-xs font-mono outline-none cursor-pointer hover:bg-white/10 transition-colors"
                      dir="ltr"
                    />
                    <button
                      onClick={copyLink}
                      className={`px-4 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                        copied ? 'bg-green-500/20 text-green-400' : 'bg-white text-black hover:bg-gray-200'
                      }`}
                    >
                      {copied ? (
                        <>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                          הועתק
                        </>
                      ) : (
                        <>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                          העתק קישור
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* QR Code */}
                <details className="bg-white/5 rounded-lg overflow-hidden">
                  <summary className="px-3 py-2 text-gray-400 text-xs cursor-pointer hover:text-white transition-colors">QR Code</summary>
                  <div className="px-3 pb-3 flex justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(fullUrl)}&bgcolor=12121a&color=ffffff&format=svg`}
                      alt="QR Code"
                      className="w-40 h-40 rounded-lg"
                    />
                  </div>
                </details>

                {/* Tabs */}
                <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
                  <button
                    onClick={() => setTab('settings')}
                    className={`flex-1 py-1.5 text-xs rounded-md transition-colors ${tab === 'settings' ? 'bg-white/10 text-white' : 'text-gray-500'}`}
                  >
                    הגדרות
                  </button>
                  <button
                    onClick={() => { setTab('analytics'); loadAnalytics() }}
                    className={`flex-1 py-1.5 text-xs rounded-md transition-colors ${tab === 'analytics' ? 'bg-white/10 text-white' : 'text-gray-500'}`}
                  >
                    אנליטיקות
                  </button>
                </div>

                {tab === 'settings' ? (
                  <div className="space-y-3">
                    {/* Mode */}
                    <div>
                      <label className="text-gray-500 text-[10px] block mb-1">מצב תצוגה</label>
                      <div className="flex gap-1">
                        {(['slideshow', 'scroll'] as const).map(m => (
                          <button
                            key={m}
                            onClick={() => updateConfig({ mode: m })}
                            className={`flex-1 py-1.5 text-xs rounded-lg transition-colors ${config.mode === m ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/30' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
                          >
                            {m === 'slideshow' ? 'מצגת' : 'גלילה'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Transitions */}
                    <div>
                      <label className="text-gray-500 text-[10px] block mb-1">מעברים</label>
                      <div className="flex gap-1">
                        {(['fade', 'slide', 'zoom', 'none'] as const).map(t => (
                          <button
                            key={t}
                            onClick={() => updateConfig({ transitions: t })}
                            className={`flex-1 py-1.5 text-[10px] rounded-lg transition-colors ${config.transitions === t ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/30' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
                          >
                            {{ fade: 'דעיכה', slide: 'החלקה', zoom: 'זום', none: 'ללא' }[t]}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Toggles */}
                    <div className="grid grid-cols-2 gap-2">
                      <ToggleOption label="Progress bar" checked={config.showProgress} onChange={(v) => updateConfig({ showProgress: v })} />
                      <ToggleOption label="ניווט" checked={config.showNav} onChange={(v) => updateConfig({ showNav: v })} />
                      <ToggleOption label="תוכן עניינים" checked={config.showToc} onChange={(v) => updateConfig({ showToc: v })} />
                      <ToggleOption label="Fullscreen" checked={config.allowFullscreen} onChange={(v) => updateConfig({ allowFullscreen: v })} />
                      <ToggleOption label="Auto-play" checked={config.autoPlay} onChange={(v) => updateConfig({ autoPlay: v })} />
                      <ToggleOption label="Branding" checked={config.showBranding} onChange={(v) => updateConfig({ showBranding: v })} />
                    </div>

                    {/* CTA */}
                    <div className="border-t border-white/5 pt-3">
                      <ToggleOption label="כפתור פעולה (CTA)" checked={config.showCta} onChange={(v) => updateConfig({ showCta: v })} />
                      {config.showCta && (
                        <div className="mt-2 space-y-2">
                          <div className="flex gap-1">
                            {(['whatsapp', 'meeting', 'approve', 'link'] as const).map(t => (
                              <button
                                key={t}
                                onClick={() => updateConfig({ ctaConfig: { ...(config.ctaConfig || { text: '', type: 'whatsapp' }), type: t } })}
                                className={`flex-1 py-1 text-[9px] rounded transition-colors ${config.ctaConfig?.type === t ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-gray-500 hover:bg-white/10'}`}
                              >
                                {{ whatsapp: 'WhatsApp', meeting: 'פגישה', approve: 'אישור', link: 'קישור' }[t]}
                              </button>
                            ))}
                          </div>
                          <input
                            type="text"
                            placeholder="טקסט הכפתור (למשל: אשר הצעה)"
                            value={config.ctaConfig?.text || ''}
                            onChange={(e) => updateConfig({ ctaConfig: { ...(config.ctaConfig || { type: 'whatsapp' }) as CtaConfig, text: e.target.value } })}
                            className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-white/30"
                          />
                          {config.ctaConfig?.type !== 'approve' && (
                            <input
                              type="text"
                              placeholder={config.ctaConfig?.type === 'whatsapp' ? 'מספר טלפון (972...)' : 'URL (https://...)'}
                              value={config.ctaConfig?.url || ''}
                              onChange={(e) => updateConfig({ ctaConfig: { ...(config.ctaConfig || { type: 'whatsapp', text: '' }) as CtaConfig, url: e.target.value } })}
                              className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-white/30"
                              dir="ltr"
                            />
                          )}
                        </div>
                      )}
                    </div>

                    {/* Deactivate */}
                    <div className="border-t border-white/5 pt-3">
                      <button
                        onClick={deactivateShare}
                        className="text-red-400/60 hover:text-red-400 text-[10px] transition-colors"
                      >
                        בטל שיתוף
                      </button>
                    </div>
                  </div>
                ) : (
                  // Analytics tab
                  <div className="space-y-3">
                    {analytics ? (
                      <>
                        <div className="grid grid-cols-3 gap-2">
                          <AnalyticsStat label="צפיות" value={analytics.totalViews.toString()} />
                          <AnalyticsStat label="סשנים" value={analytics.uniqueSessions.toString()} />
                          <AnalyticsStat label="ממוצע" value={analytics.avgDurationMs > 0 ? `${Math.round(analytics.avgDurationMs / 1000)}ש` : '—'} />
                        </div>
                        {analytics.ctaClickRate > 0 && (
                          <div className="bg-green-500/10 rounded-lg p-2 text-green-400 text-xs text-center">
                            {Math.round(analytics.ctaClickRate * 100)}% לחצו על CTA
                          </div>
                        )}
                        {analytics.slideEngagement.length > 0 && (
                          <div>
                            <label className="text-gray-500 text-[10px] block mb-1">מעורבות לפי שקף</label>
                            <div className="space-y-1">
                              {analytics.slideEngagement.map(se => (
                                <div key={se.slideIndex} className="flex items-center gap-2 text-xs">
                                  <span className="text-gray-500 w-6 text-left" dir="ltr">{se.slideIndex + 1}</span>
                                  <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-blue-500/40 rounded-full"
                                      style={{ width: `${Math.min(100, (se.avgDurationMs / 10000) * 100)}%` }}
                                    />
                                  </div>
                                  <span className="text-gray-600 text-[9px] w-8" dir="ltr">{Math.round(se.avgDurationMs / 1000)}ש</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {analytics.lastViewedAt && (
                          <div className="text-gray-600 text-[10px] text-center">
                            נצפה לאחרונה: {new Date(analytics.lastViewedAt).toLocaleString('he-IL')}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-gray-500 text-xs text-center py-4">טוען אנליטיקות...</div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function ToggleOption({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] transition-colors ${
        checked ? 'bg-blue-500/15 text-blue-400' : 'bg-white/5 text-gray-500'
      }`}
    >
      <span className={`w-3 h-3 rounded-sm border ${checked ? 'bg-blue-500 border-blue-500' : 'border-white/20'}`}>
        {checked && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
      </span>
      {label}
    </button>
  )
}

function AnalyticsStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/5 rounded-lg p-2 text-center">
      <div className="text-white font-bold text-lg" dir="ltr">{value}</div>
      <div className="text-gray-500 text-[9px]">{label}</div>
    </div>
  )
}
