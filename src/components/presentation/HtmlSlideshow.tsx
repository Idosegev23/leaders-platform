'use client'

/**
 * HtmlSlideshow — fullscreen slideshow viewer for HTML-native presentations.
 * Used in share page and presentation mode.
 * Respects ViewerConfig: autoplay, transitions, nav, progress, branding, CTA.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import type { ViewerConfig } from '@/types/share'

const DEFAULT_CONFIG: ViewerConfig = {
  mode: 'slideshow',
  transitions: 'fade',
  autoPlay: false,
  autoPlayInterval: 5000,
  showProgress: true,
  showNav: true,
  showToc: false,
  allowFullscreen: true,
  showBranding: true,
  showCta: false,
}

interface HtmlSlideshowProps {
  htmlSlides: string[]
  brandName?: string
  viewerConfig?: Partial<ViewerConfig>
}

export default function HtmlSlideshow({ htmlSlides, brandName = '', viewerConfig }: HtmlSlideshowProps) {
  const cfg = { ...DEFAULT_CONFIG, ...(viewerConfig || {}) }
  const [current, setCurrent] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [paused, setPaused] = useState(!cfg.autoPlay)
  const containerRef = useRef<HTMLDivElement>(null)
  const touchStartX = useRef(0)

  const total = htmlSlides.length

  const goNext = useCallback(() => setCurrent(c => Math.min(total - 1, c + 1)), [total])
  const goPrev = useCallback(() => setCurrent(c => Math.max(0, c - 1)), [])

  // Auto-play
  useEffect(() => {
    if (!cfg.autoPlay || paused) return
    const t = setInterval(() => {
      setCurrent(c => (c + 1 >= total ? 0 : c + 1))
    }, cfg.autoPlayInterval)
    return () => clearInterval(t)
  }, [cfg.autoPlay, cfg.autoPlayInterval, paused, total])

  // Keyboard
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); goNext() }
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); goPrev() }
      if (e.key === 'Home') { e.preventDefault(); setCurrent(0) }
      if (e.key === 'End') { e.preventDefault(); setCurrent(total - 1) }
      if ((e.key === 'f' || e.key === 'F') && cfg.allowFullscreen) toggleFullscreen()
      if (e.key === 'Escape') exitFullscreen()
      if (e.key === 'p' || e.key === 'P') setPaused(p => !p)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [goNext, goPrev, total, cfg.allowFullscreen])

  // Touch swipe
  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX }
  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(dx) > 50) { dx > 0 ? goPrev() : goNext() }
  }

  const toggleFullscreen = () => {
    if (!containerRef.current || !cfg.allowFullscreen) return
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {})
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {})
    }
  }
  const exitFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {})
  }

  const sanitize = (html: string) => html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')

  const transitionClass =
    cfg.transitions === 'fade' ? 'opacity-0 animate-fadeIn' :
    cfg.transitions === 'slide' ? 'animate-slideIn' :
    cfg.transitions === 'zoom' ? 'animate-zoomIn' : ''

  const onCta = () => {
    const c = cfg.ctaConfig
    if (!c) return
    if (c.type === 'whatsapp' && c.url) window.open(`https://wa.me/${c.url.replace(/\D/g, '')}`, '_blank')
    else if (c.url) window.open(c.url, '_blank')
  }

  const isLastSlide = current === total - 1

  return (
    <div
      ref={containerRef}
      dir="rtl"
      className="relative w-full h-screen bg-black overflow-hidden select-none"
      onClick={goNext}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideIn { from { transform: translateX(-30px); opacity: 0 } to { transform: none; opacity: 1 } }
        @keyframes zoomIn { from { transform: scale(0.96); opacity: 0 } to { transform: none; opacity: 1 } }
        .animate-fadeIn { animation: fadeIn 0.4s ease-out forwards }
        .animate-slideIn { animation: slideIn 0.4s ease-out forwards }
        .animate-zoomIn { animation: zoomIn 0.4s ease-out forwards }
      `}</style>

      {/* Current slide */}
      <div key={current} className={`absolute inset-0 flex items-center justify-center ${transitionClass}`}>
        <div
          style={{
            width: 1920, height: 1080,
            transform: `scale(${Math.min(
              (typeof window !== 'undefined' ? window.innerWidth : 1920) / 1920,
              (typeof window !== 'undefined' ? window.innerHeight : 1080) / 1080
            )})`,
            transformOrigin: 'center center',
          }}
        >
          <iframe
            srcDoc={sanitize(htmlSlides[current] || '')}
            sandbox="allow-same-origin"
            style={{ width: 1920, height: 1080, border: 'none', pointerEvents: 'none' }}
            title={`Slide ${current + 1}`}
          />
        </div>
      </div>

      {/* Progress bar */}
      {cfg.showProgress && (
        <div className="absolute top-0 inset-x-0 h-1 bg-white/10 z-10">
          <div
            className="h-full bg-white/70 transition-all duration-300"
            style={{ width: `${((current + 1) / total) * 100}%` }}
          />
        </div>
      )}

      {/* Bottom bar */}
      {(cfg.showNav || cfg.showBranding || cfg.allowFullscreen) && (
        <div className="absolute bottom-0 inset-x-0 flex items-center justify-between px-6 py-3 bg-gradient-to-t from-black/80 to-transparent opacity-0 hover:opacity-100 transition-opacity z-10">
          <div className="flex items-center gap-4">
            {cfg.showNav && (
              <>
                <button onClick={(e) => { e.stopPropagation(); goPrev() }} disabled={current === 0}
                  className="text-white/70 hover:text-white disabled:text-white/20 text-lg">→</button>
                <span className="text-white/60 text-sm font-mono">{current + 1} / {total}</span>
                <button onClick={(e) => { e.stopPropagation(); goNext() }} disabled={current === total - 1}
                  className="text-white/70 hover:text-white disabled:text-white/20 text-lg">←</button>
              </>
            )}
            {cfg.autoPlay && (
              <button onClick={(e) => { e.stopPropagation(); setPaused(p => !p) }}
                className="text-white/70 hover:text-white text-sm px-2 py-1 rounded border border-white/20">
                {paused ? '▶' : '⏸'}
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {cfg.showBranding && brandName && <span className="text-white/40 text-xs">{brandName}</span>}
            {cfg.showCta && cfg.ctaConfig && (isLastSlide || cfg.mode === 'scroll') && (
              <button onClick={(e) => { e.stopPropagation(); onCta() }}
                className="text-white text-sm px-3 py-1.5 rounded bg-[#E94560] hover:bg-[#d63951] font-medium">
                {cfg.ctaConfig.text}
              </button>
            )}
            {cfg.allowFullscreen && (
              <button onClick={(e) => { e.stopPropagation(); toggleFullscreen() }}
                className="text-white/50 hover:text-white text-sm px-2 py-1 rounded border border-white/20">
                {isFullscreen ? 'יציאה' : 'מסך מלא'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* CTA overlay on last slide if enabled */}
      {cfg.showCta && cfg.ctaConfig && isLastSlide && (
        <div className="absolute inset-x-0 bottom-20 flex justify-center z-20 pointer-events-none">
          <button onClick={(e) => { e.stopPropagation(); onCta() }}
            className="pointer-events-auto text-white text-lg px-8 py-4 rounded-lg bg-[#E94560] hover:bg-[#d63951] font-bold shadow-lg animate-fadeIn">
            {cfg.ctaConfig.text} ←
          </button>
        </div>
      )}
    </div>
  )
}
