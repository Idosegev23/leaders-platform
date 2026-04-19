/**
 * Element Builder — factory functions for creating SlideElement objects
 * Ensures all required fields are populated with correct types.
 */

import type {
  TextElement,
  ShapeElement,
  ImageElement,
  TextRole,
  FontWeight,
} from '@/types/presentation'
import type { Rect } from '../types'

let _idCounter = 0

function nextId(prefix: string): string {
  return `${prefix}-${++_idCounter}`
}

/** Reset ID counter (call at start of each slide generation) */
export function resetIds(): void {
  _idCounter = 0
}

// ─── Text Element ───────────────────────────────────────

interface TextOpts {
  content: string
  rect: Rect
  fontSize: number
  fontWeight: FontWeight
  color: string
  role: TextRole
  zIndex: number
  textAlign?: 'right' | 'center' | 'left'
  lineHeight?: number
  letterSpacing?: number
  opacity?: number
  textShadow?: string
  textStroke?: { width: number; color: string }
  textTransform?: 'none' | 'uppercase'
  backgroundColor?: string
  borderRadius?: number
  padding?: number
  rotation?: number
}

export function text(opts: TextOpts): TextElement {
  const MIN_FONT_SIZE = 12
  return {
    id: nextId('txt'),
    type: 'text',
    x: opts.rect.x,
    y: opts.rect.y,
    width: opts.rect.width,
    height: opts.rect.height,
    content: opts.content,
    fontSize: Math.max(opts.fontSize, MIN_FONT_SIZE),
    fontWeight: opts.fontWeight,
    color: opts.color,
    textAlign: opts.textAlign || 'right',
    role: opts.role,
    zIndex: opts.zIndex,
    lineHeight: opts.lineHeight,
    letterSpacing: opts.letterSpacing,
    opacity: opts.opacity,
    textShadow: opts.textShadow,
    textStroke: opts.textStroke,
    textTransform: opts.textTransform,
    backgroundColor: opts.backgroundColor,
    borderRadius: opts.borderRadius,
    padding: opts.padding,
    rotation: opts.rotation,
  }
}

// ─── Shape Element ──────────────────────────────────────

interface ShapeOpts {
  rect: Rect
  fill: string
  shapeType?: 'rectangle' | 'circle' | 'line' | 'decorative' | 'background' | 'divider'
  zIndex: number
  borderRadius?: number
  border?: string
  opacity?: number
  boxShadow?: string
  backdropFilter?: string
  clipPath?: string
  rotation?: number
}

export function shape(opts: ShapeOpts): ShapeElement {
  return {
    id: nextId('shp'),
    type: 'shape',
    x: opts.rect.x,
    y: opts.rect.y,
    width: opts.rect.width,
    height: opts.rect.height,
    fill: opts.fill,
    shapeType: opts.shapeType || 'rectangle',
    zIndex: opts.zIndex,
    borderRadius: typeof opts.borderRadius === 'number' ? opts.borderRadius : undefined,
    border: opts.border,
    opacity: opts.opacity,
    boxShadow: opts.boxShadow,
    backdropFilter: opts.backdropFilter,
    clipPath: opts.clipPath,
    rotation: opts.rotation,
  }
}

// ─── Image Element ──────────────────────────────────────

interface ImageOpts {
  src: string
  rect: Rect
  zIndex: number
  objectFit?: 'cover' | 'contain' | 'fill'
  borderRadius?: number
  opacity?: number
  filter?: string
  boxShadow?: string
}

export function image(opts: ImageOpts): ImageElement {
  return {
    id: nextId('img'),
    type: 'image',
    x: opts.rect.x,
    y: opts.rect.y,
    width: opts.rect.width,
    height: opts.rect.height,
    src: opts.src,
    alt: '',
    objectFit: opts.objectFit || 'cover',
    zIndex: opts.zIndex,
    borderRadius: opts.borderRadius,
    opacity: opts.opacity,
    filter: opts.filter,
    boxShadow: opts.boxShadow,
  }
}
