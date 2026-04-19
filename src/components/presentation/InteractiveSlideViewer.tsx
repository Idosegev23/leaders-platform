'use client'

import React, { useEffect, useRef, useState, useCallback } from 'react'
import type { Slide, DesignSystem, SlideElement, EntranceAnimationType, BaseElement } from '@/types/presentation'
import { CANVAS_WIDTH, CANVAS_HEIGHT, isTextElement, isVideoElement } from '@/types/presentation'
import ElementRenderer from './ElementRenderer'

interface InteractiveSlideViewerProps {
  slide: Slide
  designSystem: DesignSystem
  scale?: number
  isActive?: boolean  // whether this slide is currently visible (for triggering animations)
  isLastSlide?: boolean // trigger confetti on last slide
}

function build3DTransform(el: BaseElement): string | undefined {
  const parts: string[] = []
  if (el.perspective) parts.push(`perspective(${el.perspective}px)`)
  if (el.rotateX) parts.push(`rotateX(${el.rotateX}deg)`)
  if (el.rotateY) parts.push(`rotateY(${el.rotateY}deg)`)
  if (el.rotation) parts.push(`rotate(${el.rotation}deg)`)
  return parts.length ? parts.join(' ') : undefined
}

function getBackgroundStyle(bg: Slide['background']): React.CSSProperties {
  switch (bg.type) {
    case 'solid':
      return { background: bg.value }
    case 'gradient':
      return { background: bg.value }
    case 'image':
      return { background: `url('${bg.value}') center/cover no-repeat` }
    default:
      return { background: '#1a1a2e' }
  }
}

// Animation CSS for entrance animations
const ANIMATION_STYLES: Record<EntranceAnimationType, { from: React.CSSProperties; to: React.CSSProperties }> = {
  none: { from: {}, to: {} },
  'fade-up': {
    from: { opacity: 0, transform: 'translateY(30px)' },
    to: { opacity: 1, transform: 'translateY(0)' },
  },
  'fade-down': {
    from: { opacity: 0, transform: 'translateY(-30px)' },
    to: { opacity: 1, transform: 'translateY(0)' },
  },
  'slide-right': {
    from: { opacity: 0, transform: 'translateX(-40px)' },
    to: { opacity: 1, transform: 'translateX(0)' },
  },
  'slide-left': {
    from: { opacity: 0, transform: 'translateX(40px)' },
    to: { opacity: 1, transform: 'translateX(0)' },
  },
  scale: {
    from: { opacity: 0, transform: 'scale(0.8)' },
    to: { opacity: 1, transform: 'scale(1)' },
  },
  'blur-in': {
    from: { opacity: 0, filter: 'blur(10px)' },
    to: { opacity: 1, filter: 'blur(0px)' },
  },
}

export default function InteractiveSlideViewer({
  slide,
  designSystem,
  scale = 1,
  isActive = true,
  isLastSlide = false,
}: InteractiveSlideViewerProps) {
  const sortedElements = [...slide.elements].sort((a, b) => a.zIndex - b.zIndex)
  const [animatedElements, setAnimatedElements] = useState<Set<string>>(new Set())
  const [revealedElements, setRevealedElements] = useState<Set<string>>(new Set())
  const [counterValues, setCounterValues] = useState<Map<string, number>>(new Map())
  const canvasRef = useRef<HTMLDivElement>(null)
  const prevActive = useRef(false)

  // Trigger entrance animations when slide becomes active
  useEffect(() => {
    if (isActive && !prevActive.current) {
      setAnimatedElements(new Set())
      setCounterValues(new Map())

      // Stagger entrance animations
      const elementsWithAnimation = sortedElements.filter(
        el => el.entranceAnimation && el.entranceAnimation.type !== 'none'
      )

      let staggerIndex = 0
      for (const el of elementsWithAnimation) {
        const delay = (el.entranceAnimation?.delay || 0) + staggerIndex * 100
        setTimeout(() => {
          setAnimatedElements(prev => { const next = new Set(Array.from(prev)); next.add(el.id); return next })
        }, delay)
        staggerIndex++
      }

      // Immediately show elements without animation
      const noAnimationElements = sortedElements.filter(
        el => !el.entranceAnimation || el.entranceAnimation.type === 'none'
      )
      setAnimatedElements(prev => {
        const next = new Set(prev)
        noAnimationElements.forEach(el => next.add(el.id))
        return next
      })

      // Animate counters for metric-value elements
      const metricElements = sortedElements.filter(
        el => isTextElement(el) && el.role === 'metric-value'
      )
      for (const el of metricElements) {
        if (!isTextElement(el)) continue
        const numericMatch = el.content.match(/[\d,.]+/)
        if (!numericMatch) continue
        const targetValue = parseFloat(numericMatch[0].replace(/,/g, ''))
        if (isNaN(targetValue)) continue

        const startTime = Date.now()
        const duration = 1500
        const tick = () => {
          const elapsed = Date.now() - startTime
          const progress = Math.min(elapsed / duration, 1)
          // Ease out cubic
          const eased = 1 - Math.pow(1 - progress, 3)
          const current = Math.round(targetValue * eased)
          setCounterValues(prev => new Map(prev).set(el.id, current))
          if (progress < 1) requestAnimationFrame(tick)
        }
        setTimeout(tick, 300) // slight delay before counting
      }
    }
    prevActive.current = isActive
  }, [isActive]) // eslint-disable-line react-hooks/exhaustive-deps

  // Confetti on last slide
  useEffect(() => {
    if (isActive && isLastSlide) {
      // Dynamic import canvas-confetti
      import('canvas-confetti').then(({ default: confetti }) => {
        const end = Date.now() + 2000
        const fire = () => {
          confetti({
            particleCount: 3,
            angle: 60 + Math.random() * 60,
            spread: 55,
            origin: { x: Math.random(), y: Math.random() * 0.6 },
            colors: ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff6eb4'],
          })
          if (Date.now() < end) requestAnimationFrame(fire)
        }
        fire()
      }).catch(() => {}) // silently fail if library not available
    }
  }, [isActive, isLastSlide])

  // Handle click-to-reveal
  const handleReveal = useCallback((elementId: string) => {
    setRevealedElements(prev => { const next = new Set(Array.from(prev)); next.add(elementId); return next })
  }, [])

  return (
    <div
      style={{
        width: CANVAS_WIDTH * scale,
        height: CANVAS_HEIGHT * scale,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div
        ref={canvasRef}
        style={{
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          position: 'relative',
          overflow: 'clip',
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          transformStyle: 'preserve-3d',
          fontFamily: `'${designSystem.fonts.heading}', sans-serif`,
          direction: designSystem.direction,
          ...getBackgroundStyle(slide.background),
        }}
      >
        {sortedElements.map((element) => {
          const anim = element.entranceAnimation
          const animType = anim?.type || 'none'
          const animDuration = anim?.duration || 400
          const hasAnimated = animatedElements.has(element.id)
          const animStyles = ANIMATION_STYLES[animType]

          // Click-to-reveal: hidden until clicked
          const isHidden = element.hidden && element.revealTrigger === 'click' && !revealedElements.has(element.id)

          // Counter override for metric values
          const counterValue = counterValues.get(element.id)
          const displayElement = counterValue !== undefined && isTextElement(element)
            ? {
                ...element,
                content: element.content.replace(/[\d,.]+/, counterValue.toLocaleString()),
              }
            : element

          return (
            <div
              key={element.id}
              onClick={isHidden ? () => handleReveal(element.id) : undefined}
              style={{
                position: 'absolute',
                left: element.x,
                top: element.y,
                width: element.width,
                height: element.height,
                zIndex: element.zIndex,
                opacity: isHidden ? 0.15 : (element.opacity ?? 1),
                transform: build3DTransform(element),
                cursor: isHidden ? 'pointer' : undefined,
                transition: `all ${animDuration}ms cubic-bezier(0.16, 1, 0.3, 1)`,
                // Animation state
                ...(animType !== 'none' && !hasAnimated ? animStyles.from : {}),
                ...(animType !== 'none' && hasAnimated ? animStyles.to : {}),
                // Click-to-reveal transition
                ...(isHidden ? { filter: 'blur(4px)' } : {}),
              }}
            >
              <ElementRenderer
                element={displayElement}
                designSystem={designSystem}
                isEditing={false}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
