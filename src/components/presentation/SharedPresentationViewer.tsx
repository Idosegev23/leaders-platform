'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import type { Slide, DesignSystem } from '@/types/presentation'
import type { PublicPresentationData } from '@/types/share'
import InteractiveSlideViewer from './InteractiveSlideViewer'

interface SharedPresentationViewerProps {
  data: PublicPresentationData
  shareToken: string
}

export default function SharedPresentationViewer({ data, shareToken }: SharedPresentationViewerProps) {
  const { presentation, viewerConfig, brandName, shareId } = data
  const slides = presentation.slides
  const designSystem = presentation.designSystem
  const totalSlides = slides.length

  const [mode, setMode] = useState<'slideshow' | 'scroll'>(viewerConfig.mode || 'slideshow')
  const [currentSlide, setCurrentSlide] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [showToc, setShowToc] = useState(false)
  const [showShareMenu, setShowShareMenu] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const hideControlsTimer = useRef<NodeJS.Timeout | null>(null)
  const sessionId = useRef(Math.random().toString(36).slice(2) + Date.now().toString(36))
  const slideStartTime = useRef(Date.now())

  // Reading time estimate (avg 5 seconds per slide)
  const readingTimeMin = Math.max(1, Math.ceil(totalSlides * 5 / 60))

  // ─── Analytics ───────────────────────────────────────
  const trackEvent = useCallback((slideIndex: number, eventType: string, durationMs?: number) => {
    fetch(`/api/shares/${shareToken}/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: sessionId.current, slideIndex, eventType, durationMs }),
    }).catch(() => {})
  }, [shareToken])

  // Track slide view on change
  useEffect(() => {
    trackEvent(currentSlide, 'view')
    slideStartTime.current = Date.now()

    return () => {
      // Track duration when leaving slide
      const duration = Date.now() - slideStartTime.current
      if (duration > 500) {
        trackEvent(currentSlide, 'duration', duration)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSlide])

  // ─── Navigation ──────────────────────────────────────
  const goTo = useCallback((index: number) => {
    setCurrentSlide(Math.max(0, Math.min(totalSlides - 1, index)))
  }, [totalSlides])

  const next = useCallback(() => goTo(currentSlide + 1), [currentSlide, goTo])
  const prev = useCallback(() => goTo(currentSlide - 1), [currentSlide, goTo])

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (mode !== 'slideshow') return
      switch (e.key) {
        case 'ArrowRight': case 'ArrowUp': case 'PageUp': prev(); break
        case 'ArrowLeft': case 'ArrowDown': case 'PageDown': case ' ': next(); e.preventDefault(); break
        case 'Home': goTo(0); break
        case 'End': goTo(totalSlides - 1); break
        case 'f': case 'F': toggleFullscreen(); break
        case 'Escape': setShowToc(false); break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [mode, next, prev, goTo, totalSlides])

  // Auto-hide controls
  const resetControlsTimer = useCallback(() => {
    setShowControls(true)
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current)
    hideControlsTimer.current = setTimeout(() => setShowControls(false), 4000)
  }, [])

  useEffect(() => {
    resetControlsTimer()
    return () => { if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current) }
  }, [resetControlsTimer])

  // Auto-play
  useEffect(() => {
    if (!viewerConfig.autoPlay || mode !== 'slideshow') return
    const interval = setInterval(next, viewerConfig.autoPlayInterval || 5000)
    return () => clearInterval(interval)
  }, [viewerConfig.autoPlay, viewerConfig.autoPlayInterval, mode, next])

  // Fullscreen
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }, [])

  // ─── Scroll Mode: Intersection Observer ──────────────
  const scrollObserverCallback = useCallback((entries: IntersectionObserverEntry[]) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        const idx = parseInt(entry.target.getAttribute('data-slide-index') || '0')
        setCurrentSlide(idx)
      }
    }
  }, [])

  // ─── CTA Handler ─────────────────────────────────────
  const handleCta = useCallback(() => {
    trackEvent(currentSlide, 'cta_click')
    const cta = viewerConfig.ctaConfig
    if (!cta) return

    switch (cta.type) {
      case 'whatsapp': {
        const phone = cta.url?.replace(/\D/g, '') || ''
        const msg = encodeURIComponent(cta.text || `היי, אני מעוניין בהצעה של ${brandName}`)
        window.open(`https://wa.me/${phone}?text=${msg}`, '_blank')
        break
      }
      case 'meeting':
        window.open(cta.url || '#', '_blank')
        break
      case 'link':
        window.open(cta.url || '#', '_blank')
        break
      case 'approve':
        // Could trigger a webhook or just show confirmation
        alert('ההצעה אושרה! ניצור איתך קשר בהקדם.')
        break
    }
  }, [viewerConfig.ctaConfig, brandName, currentSlide, trackEvent])

  // ─── Scale calculation ───────────────────────────────
  const [scale, setScale] = useState(0.5)

  useEffect(() => {
    const updateScale = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight - (mode === 'slideshow' ? 60 : 0) // bottom bar height
      const scaleX = vw / 1920
      const scaleY = vh / 1080
      setScale(Math.min(scaleX, scaleY, 1))
    }
    updateScale()
    window.addEventListener('resize', updateScale)
    return () => window.removeEventListener('resize', updateScale)
  }, [mode])

  // ─── RENDER: Slideshow Mode ──────────────────────────
  if (mode === 'slideshow') {
    return (
      <div
        ref={containerRef}
        dir="ltr"
        className="h-screen w-screen bg-[#0a0a0f] flex flex-col items-center justify-center overflow-hidden cursor-default select-none"
        onMouseMove={resetControlsTimer}
        onClick={(e) => {
          // Click left half = prev, right half = next
          const rect = (e.target as HTMLElement).getBoundingClientRect()
          const x = e.clientX - rect.left
          if (x < rect.width / 3) prev()
          else if (x > rect.width * 2 / 3) next()
        }}
      >
        {/* Reading time (shown only on first slide for 5s) */}
        {currentSlide === 0 && (
          <ReadingTimeBadge minutes={readingTimeMin} />
        )}

        {/* Slide */}
        <div className="relative" style={{ width: Math.round(1920 * scale), height: Math.round(1080 * scale) }}>
          {slides.map((slide, idx) => (
            <div
              key={slide.id}
              className="absolute inset-0 transition-all duration-500"
              style={{
                opacity: idx === currentSlide ? 1 : 0,
                transform: viewerConfig.transitions === 'zoom'
                  ? `scale(${idx === currentSlide ? 1 : 0.95})`
                  : viewerConfig.transitions === 'slide'
                    ? `translateX(${(idx - currentSlide) * 100}%)`
                    : undefined,
                pointerEvents: idx === currentSlide ? 'auto' : 'none',
                zIndex: idx === currentSlide ? 1 : 0,
              }}
            >
              <InteractiveSlideViewer
                slide={slide}
                designSystem={designSystem}
                scale={scale}
                isActive={idx === currentSlide}
                isLastSlide={idx === totalSlides - 1}
              />
            </div>
          ))}
        </div>

        {/* Bottom controls */}
        <div
          className={`fixed bottom-0 inset-x-0 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}
          style={{ zIndex: 100 }}
        >
          {/* Progress bar */}
          {viewerConfig.showProgress && (
            <div className="h-1 bg-white/10 w-full">
              <div
                className="h-full bg-white/60 transition-all duration-300"
                style={{ width: `${((currentSlide + 1) / totalSlides) * 100}%` }}
              />
            </div>
          )}

          <div className="bg-black/60 backdrop-blur-md px-4 py-2 flex items-center justify-between" dir="ltr">
            <div className="flex items-center gap-3">
              {viewerConfig.showNav && (
                <>
                  <button onClick={prev} disabled={currentSlide === 0} className="text-white/60 hover:text-white disabled:opacity-20 p-1">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
                  </button>
                  <span className="text-white/50 text-xs tabular-nums">{currentSlide + 1} / {totalSlides}</span>
                  <button onClick={next} disabled={currentSlide === totalSlides - 1} className="text-white/60 hover:text-white disabled:opacity-20 p-1">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Mode toggle */}
              <button
                onClick={() => setMode('scroll')}
                className="text-white/40 hover:text-white text-[10px] px-2 py-1 rounded hover:bg-white/10 transition-colors"
              >
                מצב גלילה
              </button>

              {/* TOC */}
              {viewerConfig.showToc && (
                <button
                  onClick={() => setShowToc(t => !t)}
                  className="text-white/40 hover:text-white p-1"
                  title="תוכן עניינים"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
                  </svg>
                </button>
              )}

              {/* Fullscreen */}
              {viewerConfig.allowFullscreen && (
                <button onClick={toggleFullscreen} className="text-white/40 hover:text-white p-1">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    {isFullscreen ? (
                      <><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></>
                    ) : (
                      <><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></>
                    )}
                  </svg>
                </button>
              )}

              {/* Social Share */}
              <div className="relative">
                <button
                  onClick={() => setShowShareMenu(s => !s)}
                  className="text-white/40 hover:text-white p-1"
                  title="שתף"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                  </svg>
                </button>
                {showShareMenu && (
                  <ShareMenu
                    url={typeof window !== 'undefined' ? window.location.href : ''}
                    title={brandName}
                    onClose={() => setShowShareMenu(false)}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* CTA floating button */}
        {viewerConfig.showCta && viewerConfig.ctaConfig && (
          <button
            onClick={handleCta}
            className="fixed bottom-16 left-1/2 -translate-x-1/2 px-6 py-3 bg-white text-black font-bold rounded-full shadow-2xl shadow-white/20 hover:scale-105 transition-transform text-sm z-50"
          >
            {viewerConfig.ctaConfig.text || 'צור קשר'}
          </button>
        )}

        {/* TOC Drawer */}
        {showToc && (
          <TocDrawer
            slides={slides}
            currentSlide={currentSlide}
            onGoTo={(idx) => { goTo(idx); setShowToc(false) }}
            onClose={() => setShowToc(false)}
          />
        )}

        {/* Branding */}
        {viewerConfig.showBranding && (
          <div className="fixed top-3 left-3 text-white/15 text-[9px] z-50">
            Built with Leaders
          </div>
        )}
      </div>
    )
  }

  // ─── RENDER: Scroll Mode ─────────────────────────────
  return (
    <div
      ref={containerRef}
      dir="ltr"
      className="min-h-screen w-screen bg-[#0a0a0f]"
    >
      {/* Reading time header */}
      <div className="sticky top-0 z-50 bg-black/60 backdrop-blur-md border-b border-white/5">
        <div className="max-w-[1200px] mx-auto px-4 py-2 flex items-center justify-between" dir="rtl">
          <div className="flex items-center gap-3">
            <h1 className="text-white/80 text-sm font-medium">{brandName}</h1>
            <span className="text-white/30 text-[10px]">{readingTimeMin} דקות קריאה</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMode('slideshow')}
              className="text-white/40 hover:text-white text-[10px] px-2 py-1 rounded hover:bg-white/10"
            >
              מצב מצגת
            </button>
            {viewerConfig.allowFullscreen && (
              <button onClick={toggleFullscreen} className="text-white/40 hover:text-white p-1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
                </svg>
              </button>
            )}
          </div>
        </div>
        {/* Scroll progress */}
        <ScrollProgress />
      </div>

      {/* Slides */}
      <div className="py-8 space-y-8">
        {slides.map((slide, idx) => (
          <ScrollSlide
            key={slide.id}
            slide={slide}
            designSystem={designSystem}
            index={idx}
            onInView={scrollObserverCallback}
            scale={Math.min(window?.innerWidth ? (window.innerWidth - 32) / 1920 : 0.5, 0.7)}
            totalSlides={totalSlides}
          />
        ))}
      </div>

      {/* CTA at bottom */}
      {viewerConfig.showCta && viewerConfig.ctaConfig && (
        <div className="sticky bottom-0 z-50 bg-black/80 backdrop-blur-md border-t border-white/10 py-3 px-4 text-center">
          <button
            onClick={handleCta}
            className="px-8 py-3 bg-white text-black font-bold rounded-full hover:scale-105 transition-transform text-sm"
          >
            {viewerConfig.ctaConfig.text || 'צור קשר'}
          </button>
        </div>
      )}

      {/* Branding */}
      {viewerConfig.showBranding && (
        <div className="text-center py-6 text-white/10 text-[10px]">
          Built with Leaders
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────

function ReadingTimeBadge({ minutes }: { minutes: number }) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 5000)
    return () => clearTimeout(timer)
  }, [])

  if (!visible) return null

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-white/10 backdrop-blur-md rounded-full px-4 py-1.5 text-white/60 text-xs animate-fade-in">
      {minutes} דקות קריאה
    </div>
  )
}

function ScrollProgress() {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const handler = () => {
      const scrolled = window.scrollY
      const total = document.body.scrollHeight - window.innerHeight
      setProgress(total > 0 ? scrolled / total : 0)
    }
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  return (
    <div className="h-0.5 bg-white/5">
      <div className="h-full bg-white/40 transition-all duration-100" style={{ width: `${progress * 100}%` }} />
    </div>
  )
}

function ScrollSlide({ slide, designSystem, index, onInView, scale, totalSlides }: {
  slide: Slide
  designSystem: DesignSystem
  index: number
  onInView: (entries: IntersectionObserverEntry[]) => void
  scale: number
  totalSlides: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setIsVisible(true)
        }
        onInView(entries)
      },
      { threshold: 0.3 }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [onInView])

  return (
    <div
      ref={ref}
      data-slide-index={index}
      className={`flex justify-center transition-all duration-700 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      }`}
    >
      <div
        className="rounded-xl overflow-hidden shadow-2xl shadow-black/40"
        style={{ width: Math.round(1920 * scale), height: Math.round(1080 * scale) }}
      >
        <InteractiveSlideViewer
          slide={slide}
          designSystem={designSystem}
          scale={scale}
          isActive={isVisible}
          isLastSlide={index === totalSlides - 1}
        />
      </div>
    </div>
  )
}

function ShareMenu({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false)

  const shareWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(`${title}\n${url}`)}`, '_blank')
    onClose()
  }

  const shareLinkedIn = () => {
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`, '_blank')
    onClose()
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => { setCopied(false); onClose() }, 1500)
    } catch { /* ignore */ }
  }

  const shareEmail = () => {
    window.open(`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(url)}`, '_blank')
    onClose()
  }

  return (
    <div className="absolute bottom-full left-0 mb-2 bg-[#1a1a2e] border border-white/10 rounded-lg shadow-xl py-1 min-w-[150px] z-50" dir="rtl">
      <button onClick={shareWhatsApp} className="w-full px-3 py-2 text-right text-xs text-gray-300 hover:bg-white/10 hover:text-white flex items-center gap-2">
        WhatsApp
      </button>
      <button onClick={shareLinkedIn} className="w-full px-3 py-2 text-right text-xs text-gray-300 hover:bg-white/10 hover:text-white flex items-center gap-2">
        LinkedIn
      </button>
      <button onClick={shareEmail} className="w-full px-3 py-2 text-right text-xs text-gray-300 hover:bg-white/10 hover:text-white flex items-center gap-2">
        אימייל
      </button>
      <div className="border-t border-white/5 my-1" />
      <button onClick={copyLink} className="w-full px-3 py-2 text-right text-xs text-gray-300 hover:bg-white/10 hover:text-white flex items-center gap-2">
        {copied ? 'הועתק!' : 'העתק קישור'}
      </button>
    </div>
  )
}

function TocDrawer({ slides, currentSlide, onGoTo, onClose }: {
  slides: Slide[]
  currentSlide: number
  onGoTo: (idx: number) => void
  onClose: () => void
}) {
  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-72 bg-[#0f0f18] border-l border-white/10 z-50 overflow-y-auto p-4" dir="rtl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white/80 text-sm font-medium">תוכן עניינים</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white p-1">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="space-y-1">
          {slides.map((slide, idx) => (
            <button
              key={slide.id}
              onClick={() => onGoTo(idx)}
              className={`w-full text-right px-3 py-2 rounded-lg text-xs transition-colors ${
                idx === currentSlide
                  ? 'bg-white/10 text-white'
                  : 'text-white/40 hover:text-white/70 hover:bg-white/5'
              }`}
            >
              <span className="text-white/20 ml-2">{idx + 1}.</span>
              {slide.label}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
