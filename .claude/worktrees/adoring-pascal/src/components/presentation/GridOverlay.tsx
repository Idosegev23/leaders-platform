'use client'

import React from 'react'
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '@/types/presentation'

interface GridOverlayProps {
  gridSize: number
  visible: boolean
}

export default function GridOverlay({ gridSize, visible }: GridOverlayProps) {
  if (!visible) return null

  const majorEvery = 4
  const color = 'rgba(255,255,255,0.08)'
  const majorColor = 'rgba(255,255,255,0.15)'

  const lines: React.ReactElement[] = []

  for (let x = gridSize; x < CANVAS_WIDTH; x += gridSize) {
    const isMajor = (x / gridSize) % majorEvery === 0
    lines.push(
      <line key={`v-${x}`}
        x1={x} y1={0} x2={x} y2={CANVAS_HEIGHT}
        stroke={isMajor ? majorColor : color}
        strokeWidth={isMajor ? 1 : 0.5}
      />
    )
  }

  for (let y = gridSize; y < CANVAS_HEIGHT; y += gridSize) {
    const isMajor = (y / gridSize) % majorEvery === 0
    lines.push(
      <line key={`h-${y}`}
        x1={0} y1={y} x2={CANVAS_WIDTH} y2={y}
        stroke={isMajor ? majorColor : color}
        strokeWidth={isMajor ? 1 : 0.5}
      />
    )
  }

  return (
    <svg
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        pointerEvents: 'none',
        zIndex: 9999,
      }}
    >
      {lines}
    </svg>
  )
}
