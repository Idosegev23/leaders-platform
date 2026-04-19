'use client'

import React, { useState } from 'react'
import type {
  Slide,
  SlideElement,
  TextElement,
  ImageElement,
  ShapeElement,
  SlideBackground,
  DesignSystem,
  FontWeight,
} from '@/types/presentation'
import { isTextElement, isImageElement, isShapeElement } from '@/types/presentation'

const HEBREW_FONTS = [
  'Heebo', 'Rubik', 'Assistant', 'Noto Sans Hebrew', 'Open Sans',
  'Secular One', 'Varela Round', 'Alef', 'Frank Ruhl Libre', 'Karantina',
]

interface PropertiesPanelProps {
  slide: Slide
  selectedElement: SlideElement | null
  designSystem: DesignSystem
  documentId: string
  onElementUpdate: (id: string, changes: Partial<SlideElement>) => void
  onBackgroundUpdate: (bg: SlideBackground) => void
  onClose: () => void
  onImageReplace?: (elementId: string, tab?: 'upload' | 'url' | 'ai') => void
  onAIRewrite?: (elementId: string, currentText: string) => void
  onRegenerateSlide?: () => void
  aiDesignInstruction?: string
  onAiDesignInstructionChange?: (value: string) => void
  isRegenerating?: boolean
}

export default function PropertiesPanel({
  slide,
  selectedElement,
  designSystem,
  documentId: _documentId,
  onElementUpdate,
  onBackgroundUpdate,
  onClose,
  onImageReplace,
  onAIRewrite,
  onRegenerateSlide,
  aiDesignInstruction,
  onAiDesignInstructionChange,
  isRegenerating,
}: PropertiesPanelProps) {
  return (
    <div
      className="w-[420px] flex-shrink-0 bg-[#0f0f18] border-l border-white/5 flex flex-col h-full"
      dir="rtl"
    >
      {/* Header */}
      <div className="flex-shrink-0 border-b border-white/5 px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-white text-sm font-medium">
            {selectedElement ? getElementTitle(selectedElement) : slide.label}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-1">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4" style={{ scrollbarWidth: 'thin', scrollbarColor: '#333 transparent' }}>
        {selectedElement ? (
          <>
            {isTextElement(selectedElement) && (
              <TextProperties
                element={selectedElement}
                designSystem={designSystem}
                onChange={(changes) => onElementUpdate(selectedElement.id, changes)}
                onAIRewrite={onAIRewrite ? () => onAIRewrite(selectedElement.id, selectedElement.content) : undefined}
              />
            )}
            {isImageElement(selectedElement) && (
              <ImageProperties
                element={selectedElement}
                onChange={(changes) => onElementUpdate(selectedElement.id, changes)}
                onReplace={onImageReplace ? (tab) => onImageReplace(selectedElement.id, tab) : undefined}
              />
            )}
            {isShapeElement(selectedElement) && (
              <ShapeProperties
                element={selectedElement}
                onChange={(changes) => onElementUpdate(selectedElement.id, changes)}
              />
            )}
            <PositionProperties
              element={selectedElement}
              onChange={(changes) => onElementUpdate(selectedElement.id, changes)}
            />
          </>
        ) : (
          <SlideProperties
            slide={slide}
            onBackgroundUpdate={onBackgroundUpdate}
            onRegenerateSlide={onRegenerateSlide}
            aiDesignInstruction={aiDesignInstruction}
            onAiDesignInstructionChange={onAiDesignInstructionChange}
            isRegenerating={isRegenerating}
          />
        )}
      </div>
    </div>
  )
}

// ─── Element title helper ─────────────────────────────

function getElementTitle(el: SlideElement): string {
  if (isTextElement(el)) {
    const roleLabels: Record<string, string> = {
      title: 'כותרת ראשית', subtitle: 'כותרת משנית', body: 'טקסט גוף',
      caption: 'כיתוב', 'metric-value': 'ערך מדד', 'metric-label': 'תווית מדד',
      'list-item': 'פריט רשימה', tag: 'תגית',
    }
    return roleLabels[el.role || ''] || 'טקסט'
  }
  if (isImageElement(el)) return 'תמונה'
  if (isShapeElement(el)) return 'צורה'
  return 'אלמנט'
}

// ─── Text Properties ──────────────────────────────────

function TextProperties({ element, designSystem, onChange, onAIRewrite }: {
  element: TextElement
  designSystem: DesignSystem
  onChange: (changes: Partial<TextElement>) => void
  onAIRewrite?: () => void
}) {
  const isHeading = element.role === 'title' || element.role === 'subtitle'

  return (
    <div className="space-y-3">
      <SectionLabel>תוכן</SectionLabel>

      {isHeading ? (
        <input
          type="text"
          value={element.content}
          onChange={(e) => onChange({ content: e.target.value })}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-white/30"
          dir="rtl"
        />
      ) : (
        <textarea
          value={element.content}
          onChange={(e) => onChange({ content: e.target.value })}
          rows={Math.min(Math.max(2, Math.ceil(element.content.length / 40)), 8)}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-white/30 resize-none"
          dir="rtl"
        />
      )}

      {onAIRewrite && (
        <button onClick={onAIRewrite} className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-purple-500/10 border border-purple-500/20 rounded-lg text-purple-300 text-xs hover:bg-purple-500/20 transition-colors">
          <span>✨</span><span>שכתב עם AI</span>
        </button>
      )}

      <SectionLabel>סגנון טקסט</SectionLabel>

      <div>
        <MiniLabel>גופן</MiniLabel>
        <select
          value={element.fontFamily || designSystem.fonts.heading}
          onChange={(e) => onChange({ fontFamily: e.target.value })}
          className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-white/30"
        >
          {HEBREW_FONTS.map(font => (
            <option key={font} value={font}>{font}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <MiniLabel>גודל גופן</MiniLabel>
          <input type="number" value={element.fontSize} onChange={(e) => onChange({ fontSize: Math.max(8, Math.min(200, parseInt(e.target.value) || 16)) })} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-white/30" dir="ltr" />
        </div>
        <div>
          <MiniLabel>משקל</MiniLabel>
          <select value={element.fontWeight} onChange={(e) => onChange({ fontWeight: parseInt(e.target.value) as FontWeight })} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-white/30">
            <option value={300}>Light (300)</option>
            <option value={400}>Regular (400)</option>
            <option value={500}>Medium (500)</option>
            <option value={600}>Semi Bold (600)</option>
            <option value={700}>Bold (700)</option>
            <option value={800}>Extra Bold (800)</option>
            <option value={900}>Black (900)</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <MiniLabel>צבע</MiniLabel>
          <div className="flex gap-1">
            <input type="color" value={element.color} onChange={(e) => onChange({ color: e.target.value })} className="w-8 h-8 rounded border border-white/10 cursor-pointer bg-transparent" />
            <input type="text" value={element.color} onChange={(e) => onChange({ color: e.target.value })} className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-white/30 font-mono" dir="ltr" />
          </div>
        </div>
        <div>
          <MiniLabel>יישור</MiniLabel>
          <div className="flex gap-1">
            {(['right', 'center', 'left'] as const).map((align) => (
              <button key={align} onClick={() => onChange({ textAlign: align })} className={`flex-1 py-1.5 rounded text-xs ${element.textAlign === align ? 'bg-white/20 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
                {align === 'right' ? 'ימין' : align === 'center' ? 'מרכז' : 'שמאל'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <MiniLabel>שקיפות</MiniLabel>
        <div className="flex items-center gap-2">
          <input type="range" min={0} max={1} step={0.05} value={element.opacity ?? 1} onChange={(e) => onChange({ opacity: parseFloat(e.target.value) })} className="flex-1" />
          <span className="text-gray-500 text-[10px] w-8 text-left" dir="ltr">{Math.round((element.opacity ?? 1) * 100)}%</span>
        </div>
      </div>
    </div>
  )
}

// ─── Image Properties ─────────────────────────────────

function ImageProperties({ element, onChange, onReplace }: {
  element: ImageElement
  onChange: (changes: Partial<ImageElement>) => void
  onReplace?: (tab?: 'upload' | 'url' | 'ai') => void
}) {
  return (
    <div className="space-y-3">
      <SectionLabel>תמונה</SectionLabel>

      {element.src && (
        <div className="rounded-lg overflow-hidden bg-black/30 border border-white/5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={element.src} alt={element.alt || ''} className="w-full h-32 object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
        </div>
      )}

      {onReplace && (
        <div className="grid grid-cols-3 gap-1.5">
          <button onClick={() => onReplace('upload')} className="px-2 py-2 bg-white/5 border border-white/10 rounded-lg text-gray-300 text-[11px] hover:bg-white/10 transition-colors">📁 העלה</button>
          <button onClick={() => onReplace('url')} className="px-2 py-2 bg-white/5 border border-white/10 rounded-lg text-gray-300 text-[11px] hover:bg-white/10 transition-colors">🔗 URL</button>
          <button onClick={() => onReplace('ai')} className="px-2 py-2 bg-purple-500/10 border border-purple-500/20 rounded-lg text-purple-300 text-[11px] hover:bg-purple-500/20 transition-colors">✨ AI</button>
        </div>
      )}

      <SectionLabel>הגדרות</SectionLabel>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <MiniLabel>התאמה</MiniLabel>
          <select value={element.objectFit} onChange={(e) => onChange({ objectFit: e.target.value as ImageElement['objectFit'] })} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-white/30">
            <option value="cover">מילוי (cover)</option>
            <option value="contain">התאמה (contain)</option>
            <option value="fill">מתיחה (fill)</option>
          </select>
        </div>
        <div>
          <MiniLabel>עיגול פינות</MiniLabel>
          <input type="number" value={element.borderRadius || 0} onChange={(e) => onChange({ borderRadius: Math.max(0, parseInt(e.target.value) || 0) })} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-white/30" dir="ltr" />
        </div>
      </div>

      <div>
        <MiniLabel>שקיפות</MiniLabel>
        <div className="flex items-center gap-2">
          <input type="range" min={0} max={1} step={0.05} value={element.opacity ?? 1} onChange={(e) => onChange({ opacity: parseFloat(e.target.value) })} className="flex-1" />
          <span className="text-gray-500 text-[10px] w-8 text-left" dir="ltr">{Math.round((element.opacity ?? 1) * 100)}%</span>
        </div>
      </div>

      <div>
        <MiniLabel>URL תמונה</MiniLabel>
        <input type="text" value={element.src} onChange={(e) => onChange({ src: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-[10px] focus:outline-none focus:border-white/30 font-mono" dir="ltr" />
      </div>
    </div>
  )
}

// ─── Shape Properties ─────────────────────────────────

function ShapeProperties({ element, onChange }: {
  element: ShapeElement
  onChange: (changes: Partial<ShapeElement>) => void
}) {
  return (
    <div className="space-y-3">
      <SectionLabel>צורה</SectionLabel>

      <div>
        <MiniLabel>מילוי</MiniLabel>
        <div className="flex gap-1">
          <input type="color" value={element.fill?.startsWith('#') ? element.fill : '#333333'} onChange={(e) => onChange({ fill: e.target.value })} className="w-8 h-8 rounded border border-white/10 cursor-pointer bg-transparent" />
          <input type="text" value={element.fill || ''} onChange={(e) => onChange({ fill: e.target.value })} className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-white/30 font-mono" dir="ltr" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <MiniLabel>עיגול פינות</MiniLabel>
          <input type="number" value={element.borderRadius || 0} onChange={(e) => onChange({ borderRadius: Math.max(0, parseInt(e.target.value) || 0) })} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-white/30" dir="ltr" />
        </div>
        <div>
          <MiniLabel>שקיפות</MiniLabel>
          <input type="range" min={0} max={1} step={0.05} value={element.opacity ?? 1} onChange={(e) => onChange({ opacity: parseFloat(e.target.value) })} className="w-full mt-1" />
        </div>
      </div>
    </div>
  )
}

// ─── Position Properties ──────────────────────────────

function PositionProperties({ element, onChange }: {
  element: SlideElement
  onChange: (changes: Partial<SlideElement>) => void
}) {
  return (
    <div className="space-y-3">
      <SectionLabel>מיקום וגודל</SectionLabel>

      <div className="grid grid-cols-2 gap-2">
        <div><MiniLabel>X</MiniLabel><input type="number" value={Math.round(element.x)} onChange={(e) => onChange({ x: parseInt(e.target.value) || 0 })} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-white/30" dir="ltr" /></div>
        <div><MiniLabel>Y</MiniLabel><input type="number" value={Math.round(element.y)} onChange={(e) => onChange({ y: parseInt(e.target.value) || 0 })} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-white/30" dir="ltr" /></div>
        <div><MiniLabel>רוחב</MiniLabel><input type="number" value={Math.round(element.width)} onChange={(e) => onChange({ width: Math.max(10, parseInt(e.target.value) || 10) })} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-white/30" dir="ltr" /></div>
        <div><MiniLabel>גובה</MiniLabel><input type="number" value={Math.round(element.height)} onChange={(e) => onChange({ height: Math.max(10, parseInt(e.target.value) || 10) })} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-white/30" dir="ltr" /></div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div><MiniLabel>שכבה (Z)</MiniLabel><input type="number" value={element.zIndex} onChange={(e) => onChange({ zIndex: parseInt(e.target.value) || 0 })} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-white/30" dir="ltr" /></div>
        <div><MiniLabel>סיבוב</MiniLabel><input type="number" value={element.rotation || 0} onChange={(e) => onChange({ rotation: parseInt(e.target.value) || 0 })} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-white/30" dir="ltr" /></div>
        <div>
          <MiniLabel>נעילה</MiniLabel>
          <button onClick={() => onChange({ locked: !element.locked })} className={`w-full py-1.5 rounded text-xs ${element.locked ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30' : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'}`}>
            {element.locked ? '🔒 נעול' : '🔓 פתוח'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Slide Properties ─────────────────────────────────

function SlideProperties({ slide, onBackgroundUpdate, onRegenerateSlide, aiDesignInstruction, onAiDesignInstructionChange, isRegenerating }: {
  slide: Slide
  onBackgroundUpdate: (bg: SlideBackground) => void
  onRegenerateSlide?: () => void
  aiDesignInstruction?: string
  onAiDesignInstructionChange?: (value: string) => void
  isRegenerating?: boolean
}) {
  const [bgType, setBgType] = useState(slide.background.type)

  return (
    <div className="space-y-4">
      <div className="text-center py-4">
        <p className="text-gray-500 text-xs mb-2">בחר אלמנט בשקף לעריכה</p>
        <p className="text-gray-600 text-[10px]">או ערוך את הגדרות השקף למטה</p>
      </div>

      <SectionLabel>רקע שקף</SectionLabel>

      <div className="flex gap-1">
        {(['solid', 'gradient', 'image'] as const).map((type) => (
          <button key={type} onClick={() => setBgType(type)} className={`flex-1 py-1.5 rounded text-xs ${bgType === type ? 'bg-white/20 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
            {type === 'solid' ? 'צבע' : type === 'gradient' ? 'גרדיאנט' : 'תמונה'}
          </button>
        ))}
      </div>

      <div>
        <MiniLabel>ערך</MiniLabel>
        <input type="text" value={slide.background.value} onChange={(e) => onBackgroundUpdate({ type: bgType, value: e.target.value })} placeholder={bgType === 'solid' ? '#1a1a2e' : bgType === 'gradient' ? 'linear-gradient(...)' : 'URL'} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-white/30 font-mono" dir="ltr" />
      </div>

      {bgType === 'solid' && (
        <input type="color" value={slide.background.value.startsWith('#') ? slide.background.value : '#1a1a2e'} onChange={(e) => onBackgroundUpdate({ type: 'solid', value: e.target.value })} className="w-full h-10 rounded border border-white/10 cursor-pointer bg-transparent" />
      )}

      {onRegenerateSlide && (
        <>
          <SectionLabel>עיצוב AI</SectionLabel>
          <textarea
            value={aiDesignInstruction || ''}
            onChange={(e) => onAiDesignInstructionChange?.(e.target.value)}
            placeholder='הנחיות לעיצוב (אופציונלי)... לדוגמה: "יותר מינימליסטי", "הוסף גרף", "שנה לסגנון כהה"'
            rows={2}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-white/30 resize-none placeholder:text-gray-600"
            dir="rtl"
          />
          <button
            onClick={onRegenerateSlide}
            disabled={isRegenerating}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-purple-500/10 border border-purple-500/20 rounded-lg text-purple-300 text-xs hover:bg-purple-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isRegenerating ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                <span>מעצב...</span>
              </>
            ) : (
              <><span>✨</span><span>עצב שקף עם AI</span></>
            )}
          </button>
        </>
      )}

      <SectionLabel>מידע</SectionLabel>
      <div className="text-gray-500 text-[10px] space-y-1">
        <p>סוג: {slide.slideType}</p>
        <p>אלמנטים: {slide.elements.length}</p>
        <p>ID: {slide.id}</p>
      </div>
    </div>
  )
}

// ─── Shared UI Components ─────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="text-gray-400 text-[11px] font-medium uppercase tracking-wider pt-2 first:pt-0">{children}</h3>
}

function MiniLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-gray-500 text-[10px] block mb-0.5">{children}</label>
}
