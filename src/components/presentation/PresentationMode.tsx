'use client'

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { Slide, DesignSystem } from '@/types/presentation'
import SlideViewer from './SlideViewer'

interface PresentationModeProps {
  slides: Slide[]
  designSystem: DesignSystem
  startIndex?: number
  onExit: () => void
}

export default function PresentationMode({
  slides,
  designSystem,
  startIndex = 0,
  onExit,
}: PresentationModeProps) {
  const [currentIndex, setCurrentIndex] = useState(startIndex)
  const [scale, setScale] = useState(1)
  const [showControls, setShowControls] = useState(true)

  const totalSlides = slides.length

  const goNext = useCallback(() => {
    setCurrentIndex(i => Math.min(i + 1, totalSlides - 1))
  }, [totalSlides])

  const goPrev = useCallback(() => {
    setCurrentIndex(i => Math.max(i - 1, 0))
  }, [])

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // If in fullscreen, browser handles ESC → fullscreenchange → onExit
        // If not in fullscreen, we call onExit directly
        if (!document.fullscreenElement) onExit()
        return
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'PageUp') { goPrev(); return }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') { goNext(); return }
      if (e.key === 'Home') { setCurrentIndex(0); return }
      if (e.key === 'End') { setCurrentIndex(totalSlides - 1); return }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onExit, goNext, goPrev, totalSlides])

  // Calculate scale to fit viewport
  useEffect(() => {
    const resize = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      const scaleX = vw / 1920
      const scaleY = vh / 1080
      setScale(Math.min(scaleX, scaleY))
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  // Request fullscreen + listen for fullscreen exit to trigger onExit
  useEffect(() => {
    document.documentElement.requestFullscreen?.().catch(() => {})

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        onExit()
      }
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {})
      }
    }
  }, [onExit])

  // Auto-hide controls
  useEffect(() => {
    setShowControls(true)
    const timer = setTimeout(() => setShowControls(false), 3000)
    return () => clearTimeout(timer)
  }, [currentIndex])

  const slide = slides[currentIndex]
  if (!slide) return null

  const content = (
    <div
      dir="ltr"
      className="fixed inset-0 z-[9999] bg-black flex items-center justify-center cursor-none"
      onClick={goNext}
      onMouseMove={() => setShowControls(true)}
    >
      {/* Slide */}
      <SlideViewer slide={slide} designSystem={designSystem} scale={scale} />

      {/* Controls overlay */}
      <div
        className={`absolute bottom-0 left-0 right-0 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ cursor: 'default' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-gradient-to-t from-black/80 to-transparent pt-12 pb-4 px-6">
          <div className="flex items-center justify-between max-w-3xl mx-auto">
            {/* Navigation */}
            <div className="flex items-center gap-3">
              <button
                onClick={goPrev}
                disabled={currentIndex === 0}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 flex items-center justify-center text-white transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
              <span className="text-white/80 text-sm font-medium tabular-nums min-w-[60px] text-center" dir="ltr">
                {currentIndex + 1} / {totalSlides}
              </span>
              <button
                onClick={goNext}
                disabled={currentIndex === totalSlides - 1}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 flex items-center justify-center text-white transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
            </div>

            {/* Progress bar */}
            <div className="flex-1 mx-6 h-1 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-white/60 rounded-full transition-all duration-300"
                style={{ width: `${((currentIndex + 1) / totalSlides) * 100}%` }}
              />
            </div>

            {/* Exit */}
            <button
              onClick={onExit}
              className="text-white/60 hover:text-white text-xs font-medium transition-colors"
            >
              ESC לצאת
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(content, document.body)
}
