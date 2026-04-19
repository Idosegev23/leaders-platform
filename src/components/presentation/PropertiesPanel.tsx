'use client'

import React, { useState } from 'react'
import type {
  Slide,
  SlideElement,
  TextElement,
  ImageElement,
  ShapeElement,
  VideoElement,
  MockupElement,
  CompareElement,
  LogoStripElement,
  MapElement,
  SlideBackground,
  DesignSystem,
  FontWeight,
  BorderRadius,
  MaskConfig,
  MaskType,
  MockupDeviceType,
  MockupDeviceColor,
} from '@/types/presentation'
import { isTextElement, isImageElement, isShapeElement, isVideoElement, isMockupElement, isCompareElement, isLogoStripElement, isMapElement, MASK_CLIP_PATHS } from '@/types/presentation'

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
  onMockupContentReplace?: (elementId: string) => void
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
  onMockupContentReplace,
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
            {isVideoElement(selectedElement) && (
              <VideoProperties
                element={selectedElement}
                onChange={(changes) => onElementUpdate(selectedElement.id, changes)}
              />
            )}
            {isMockupElement(selectedElement) && (
              <MockupProperties
                element={selectedElement}
                onChange={(changes) => onElementUpdate(selectedElement.id, changes)}
                onContentReplace={onMockupContentReplace ? () => onMockupContentReplace(selectedElement.id) : undefined}
              />
            )}
            {isCompareElement(selectedElement) && (
              <CompareProperties
                element={selectedElement}
                onChange={(changes) => onElementUpdate(selectedElement.id, changes)}
              />
            )}
            {isLogoStripElement(selectedElement) && (
              <LogoStripProperties
                element={selectedElement}
                onChange={(changes) => onElementUpdate(selectedElement.id, changes)}
              />
            )}
            {isMapElement(selectedElement) && (
              <MapProperties
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
  if (isVideoElement(el)) return 'וידאו'
  if (isShapeElement(el)) return 'צורה'
  if (isMockupElement(el)) return 'מוקאפ'
  if (isCompareElement(el)) return 'לפני/אחרי'
  if (isLogoStripElement(el)) return 'רצועת לוגו'
  if (isMapElement(el)) return 'מפה'
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

      <div>
        <MiniLabel>התאמה</MiniLabel>
        <select value={element.objectFit} onChange={(e) => onChange({ objectFit: e.target.value as ImageElement['objectFit'] })} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-white/30">
          <option value="cover">מילוי (cover)</option>
          <option value="contain">התאמה (contain)</option>
          <option value="fill">מתיחה (fill)</option>
        </select>
      </div>

      <BorderRadiusControl
        borderRadius={element.borderRadius}
        onChange={(br) => onChange({ borderRadius: br })}
      />

      <MaskControl
        mask={element.mask}
        onChange={(mask) => onChange({ mask })}
      />

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

      <BorderRadiusControl
        borderRadius={element.borderRadius}
        onChange={(br) => onChange({ borderRadius: br })}
      />

      <MaskControl
        mask={element.mask}
        onChange={(mask) => onChange({ mask })}
      />

      <div>
        <MiniLabel>שקיפות</MiniLabel>
        <input type="range" min={0} max={1} step={0.05} value={element.opacity ?? 1} onChange={(e) => onChange({ opacity: parseFloat(e.target.value) })} className="w-full mt-1" />
      </div>
    </div>
  )
}

// ─── Video Properties ────────────────────────────────

function VideoProperties({ element, onChange }: {
  element: VideoElement
  onChange: (changes: Partial<VideoElement>) => void
}) {
  return (
    <div className="space-y-3">
      <SectionLabel>וידאו</SectionLabel>

      <div>
        <MiniLabel>מקור</MiniLabel>
        <input type="text" value={element.src} onChange={(e) => onChange({ src: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-[10px] focus:outline-none focus:border-white/30 font-mono" dir="ltr" />
      </div>

      <div>
        <MiniLabel>תמונת פוסטר</MiniLabel>
        <input type="text" value={element.posterImage || ''} onChange={(e) => onChange({ posterImage: e.target.value || undefined })} placeholder="URL תמונה" className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-[10px] focus:outline-none focus:border-white/30 font-mono" dir="ltr" />
      </div>

      <SectionLabel>הגדרות</SectionLabel>

      <div>
        <MiniLabel>התאמה</MiniLabel>
        <select value={element.objectFit || 'cover'} onChange={(e) => onChange({ objectFit: e.target.value as VideoElement['objectFit'] })} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-white/30">
          <option value="cover">מילוי (cover)</option>
          <option value="contain">התאמה (contain)</option>
          <option value="fill">מתיחה (fill)</option>
        </select>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <label className="flex items-center gap-1.5 text-gray-400 text-[10px] cursor-pointer">
          <input type="checkbox" checked={element.autoPlay !== false} onChange={(e) => onChange({ autoPlay: e.target.checked })} className="rounded" />
          הפעל אוטומטית
        </label>
        <label className="flex items-center gap-1.5 text-gray-400 text-[10px] cursor-pointer">
          <input type="checkbox" checked={element.muted !== false} onChange={(e) => onChange({ muted: e.target.checked })} className="rounded" />
          מושתק
        </label>
        <label className="flex items-center gap-1.5 text-gray-400 text-[10px] cursor-pointer">
          <input type="checkbox" checked={element.loop !== false} onChange={(e) => onChange({ loop: e.target.checked })} className="rounded" />
          לולאה
        </label>
      </div>

      <BorderRadiusControl
        borderRadius={element.borderRadius}
        onChange={(br) => onChange({ borderRadius: br })}
      />

      <MaskControl
        mask={element.mask}
        onChange={(mask) => onChange({ mask })}
      />

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

// ─── Mockup Properties ──────────────────────────────

const DEVICE_OPTIONS: { type: MockupDeviceType; label: string; group?: string }[] = [
  // MagicUI — premium SVG mockups
  { type: 'iPhone 15 Pro', label: '✦ iPhone 15 Pro', group: 'פרימיום' },
  { type: 'Safari', label: '✦ Safari Browser', group: 'פרימיום' },
  { type: 'Android', label: '✦ Android', group: 'פרימיום' },
  // Frameset devices
  { type: 'iPhone X', label: 'iPhone X', group: 'Apple' },
  { type: 'iPhone 8', label: 'iPhone 8', group: 'Apple' },
  { type: 'iPhone 8 Plus', label: 'iPhone 8 Plus', group: 'Apple' },
  { type: 'iPad Mini', label: 'iPad Mini', group: 'Apple' },
  { type: 'MacBook Pro', label: 'MacBook Pro', group: 'Apple' },
  { type: 'Galaxy Note 8', label: 'Galaxy Note 8', group: 'Android' },
  { type: 'Samsung Galaxy S5', label: 'Samsung Galaxy S5', group: 'Android' },
  { type: 'Nexus 5', label: 'Nexus 5', group: 'Android' },
  { type: 'HTC One', label: 'HTC One', group: 'Other' },
  { type: 'Lumia 920', label: 'Lumia 920', group: 'Other' },
]

// Colors available per device (from react-device-frameset)
const MOCKUP_DEVICE_COLORS: Record<string, MockupDeviceColor[]> = {
  'iPhone X': [],
  'iPhone 8': ['black', 'silver', 'gold'],
  'iPhone 8 Plus': ['black', 'silver', 'gold'],
  'iPhone 5s': ['black', 'silver', 'gold'],
  'iPhone 5c': ['white', 'red', 'yellow', 'green', 'blue'],
  'iPhone 4s': ['black', 'silver'],
  'iPad Mini': [],
  'MacBook Pro': [],
  'Galaxy Note 8': [],
  'Samsung Galaxy S5': [],
  'Nexus 5': [],
  'HTC One': [],
  'Lumia 920': ['black', 'white', 'yellow', 'red', 'blue'],
}

const COLOR_LABELS: Record<string, string> = {
  black: 'שחור', silver: 'כסוף', gold: 'זהב', white: 'לבן',
  red: 'אדום', yellow: 'צהוב', green: 'ירוק', blue: 'כחול',
}

function MockupProperties({ element, onChange, onContentReplace }: {
  element: MockupElement
  onChange: (changes: Partial<MockupElement>) => void
  onContentReplace?: () => void
}) {
  const availableColors = MOCKUP_DEVICE_COLORS[element.deviceType] || []
  const hasContent = element.contentType !== 'color' && !!element.contentSrc

  return (
    <div className="space-y-3">
      <SectionLabel>מוקאפ</SectionLabel>

      {/* Content upload button — prominent */}
      <div>
        <MiniLabel>תוכן המסך</MiniLabel>
        {onContentReplace && (
          <button
            onClick={onContentReplace}
            className="w-full py-3 rounded-lg border-2 border-dashed border-white/20 hover:border-white/40 bg-white/5 hover:bg-white/10 transition-all flex flex-col items-center gap-1.5 group"
          >
            {hasContent ? (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/60 group-hover:text-white/80">
                  <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" /><path d="M12 12v9" /><path d="m16 16-4-4-4 4" />
                </svg>
                <span className="text-white/60 group-hover:text-white/80 text-xs">החלף תמונה / וידאו</span>
              </>
            ) : (
              <>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/40 group-hover:text-white/70">
                  <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                </svg>
                <span className="text-white/40 group-hover:text-white/70 text-xs font-medium">הוסף תמונה או וידאו למסך</span>
              </>
            )}
          </button>
        )}
        {/* Manual URL input */}
        <input type="text" value={(element.contentType !== 'color' && element.contentSrc) || ''} onChange={(e) => onChange({ contentSrc: e.target.value, contentType: 'image' })} placeholder="או הדבק URL ישירות..." className="w-full mt-2 bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-[10px] focus:outline-none focus:border-white/30 font-mono" dir="ltr" />
        {/* Content type toggle */}
        {hasContent && (
          <div className="flex gap-1 mt-2">
            <button onClick={() => onChange({ contentType: 'image' })} className={`flex-1 py-1 rounded text-xs ${element.contentType === 'image' ? 'bg-white/20 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>תמונה</button>
            <button onClick={() => onChange({ contentType: 'video' })} className={`flex-1 py-1 rounded text-xs ${element.contentType === 'video' ? 'bg-white/20 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>וידאו</button>
          </div>
        )}
      </div>

      <div>
        <MiniLabel>מכשיר</MiniLabel>
        <select value={element.deviceType} onChange={(e) => onChange({ deviceType: e.target.value as MockupDeviceType, deviceColor: undefined })} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-white/30">
          {DEVICE_OPTIONS.map(d => <option key={d.type} value={d.type}>{d.label}</option>)}
        </select>
      </div>
      {availableColors.length > 0 && (
        <div>
          <MiniLabel>צבע מכשיר</MiniLabel>
          <div className="flex flex-wrap gap-1">
            {availableColors.map(c => (
              <button key={c} onClick={() => onChange({ deviceColor: c as MockupDeviceColor })} className={`px-2 py-1.5 rounded text-xs ${element.deviceColor === c ? 'bg-white/20 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
                {COLOR_LABELS[c] || c}
              </button>
            ))}
          </div>
        </div>
      )}
      <div>
        <label className="flex items-center gap-2 text-gray-400 text-xs cursor-pointer">
          <input type="checkbox" checked={element.landscape || false} onChange={(e) => onChange({ landscape: e.target.checked })} className="rounded bg-white/10 border-white/20" />
          מצב לרוחב (Landscape)
        </label>
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

// ─── Compare Properties ─────────────────────────────

function CompareProperties({ element, onChange }: {
  element: CompareElement
  onChange: (changes: Partial<CompareElement>) => void
}) {
  return (
    <div className="space-y-3">
      <SectionLabel>השוואה לפני/אחרי</SectionLabel>
      <div>
        <MiniLabel>תמונת &quot;לפני&quot;</MiniLabel>
        <input type="text" value={element.beforeImage || ''} onChange={(e) => onChange({ beforeImage: e.target.value })} placeholder="URL" className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-[10px] focus:outline-none focus:border-white/30 font-mono" dir="ltr" />
      </div>
      <div>
        <MiniLabel>תמונת &quot;אחרי&quot;</MiniLabel>
        <input type="text" value={element.afterImage || ''} onChange={(e) => onChange({ afterImage: e.target.value })} placeholder="URL" className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-[10px] focus:outline-none focus:border-white/30 font-mono" dir="ltr" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <MiniLabel>תווית לפני</MiniLabel>
          <input type="text" value={element.beforeLabel || ''} onChange={(e) => onChange({ beforeLabel: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-white/30" dir="rtl" />
        </div>
        <div>
          <MiniLabel>תווית אחרי</MiniLabel>
          <input type="text" value={element.afterLabel || ''} onChange={(e) => onChange({ afterLabel: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-white/30" dir="rtl" />
        </div>
      </div>
      <div>
        <MiniLabel>מיקום התחלתי ({element.initialPosition || 50}%)</MiniLabel>
        <input type="range" min={10} max={90} value={element.initialPosition || 50} onChange={(e) => onChange({ initialPosition: parseInt(e.target.value) })} className="w-full" />
      </div>
    </div>
  )
}

// ─── Logo Strip Properties ──────────────────────────

function LogoStripProperties({ element, onChange }: {
  element: LogoStripElement
  onChange: (changes: Partial<LogoStripElement>) => void
}) {
  const [newLogo, setNewLogo] = useState('')

  const addLogo = () => {
    if (!newLogo.trim()) return
    onChange({ logos: [...(element.logos || []), newLogo.trim()] })
    setNewLogo('')
  }

  const removeLogo = (idx: number) => {
    const logos = [...(element.logos || [])]
    logos.splice(idx, 1)
    onChange({ logos })
  }

  return (
    <div className="space-y-3">
      <SectionLabel>רצועת לוגו</SectionLabel>
      <div>
        <MiniLabel>לוגואים ({(element.logos || []).length})</MiniLabel>
        <div className="space-y-1 max-h-32 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          {(element.logos || []).map((logo, i) => (
            <div key={i} className="flex items-center gap-1">
              <input type="text" value={logo} onChange={(e) => { const logos = [...(element.logos || [])]; logos[i] = e.target.value; onChange({ logos }) }} className="flex-1 bg-white/5 border border-white/10 rounded px-1.5 py-1 text-white text-[9px] focus:outline-none font-mono" dir="ltr" />
              <button onClick={() => removeLogo(i)} className="text-red-400/60 hover:text-red-400 text-xs px-1">×</button>
            </div>
          ))}
        </div>
        <div className="flex gap-1 mt-1">
          <input type="text" value={newLogo} onChange={(e) => setNewLogo(e.target.value)} placeholder="URL לוגו חדש" className="flex-1 bg-white/5 border border-white/10 rounded px-1.5 py-1 text-white text-[9px] focus:outline-none font-mono" dir="ltr" onKeyDown={(e) => e.key === 'Enter' && addLogo()} />
          <button onClick={addLogo} className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs">+</button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <MiniLabel>מהירות</MiniLabel>
          <input type="number" value={element.speed || 40} onChange={(e) => onChange({ speed: parseInt(e.target.value) || 40 })} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-white/30" dir="ltr" min={10} max={200} />
        </div>
        <div>
          <MiniLabel>רווח</MiniLabel>
          <input type="number" value={element.gap || 60} onChange={(e) => onChange({ gap: parseInt(e.target.value) || 60 })} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-white/30" dir="ltr" min={10} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-gray-400 text-[10px] cursor-pointer">
        <input type="checkbox" checked={element.grayscale || false} onChange={(e) => onChange({ grayscale: e.target.checked })} className="rounded" />
        אפור + צבע בהובר
      </label>
    </div>
  )
}

// ─── Map Properties ─────────────────────────────────

function MapProperties({ element, onChange }: {
  element: MapElement
  onChange: (changes: Partial<MapElement>) => void
}) {
  return (
    <div className="space-y-3">
      <SectionLabel>מפה</SectionLabel>
      <div>
        <MiniLabel>כתובת</MiniLabel>
        <input type="text" value={element.address || ''} onChange={(e) => onChange({ address: e.target.value })} placeholder="תל אביב, ישראל" className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-white/30" dir="rtl" />
      </div>
      <div>
        <MiniLabel>זום ({element.zoom || 15})</MiniLabel>
        <input type="range" min={5} max={20} value={element.zoom || 15} onChange={(e) => onChange({ zoom: parseInt(e.target.value) })} className="w-full" />
      </div>
      <BorderRadiusControl
        borderRadius={element.borderRadius}
        onChange={(br) => onChange({ borderRadius: br })}
      />
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

      {/* 3D Transform */}
      <div className="grid grid-cols-3 gap-2">
        <div><MiniLabel>סיבוב X</MiniLabel><input type="number" value={element.rotateX || 0} onChange={(e) => onChange({ rotateX: parseInt(e.target.value) || 0 })} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-white/30" dir="ltr" placeholder="0°" /></div>
        <div><MiniLabel>סיבוב Y</MiniLabel><input type="number" value={element.rotateY || 0} onChange={(e) => onChange({ rotateY: parseInt(e.target.value) || 0 })} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-white/30" dir="ltr" placeholder="0°" /></div>
        <div><MiniLabel>פרספקטיבה</MiniLabel><input type="number" value={element.perspective || 0} onChange={(e) => onChange({ perspective: parseInt(e.target.value) || 0 })} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-white/30" dir="ltr" placeholder="1200" /></div>
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

// ─── Border Radius Control (per-corner) ──────────────

function BorderRadiusControl({ borderRadius, onChange }: {
  borderRadius: BorderRadius | undefined
  onChange: (br: BorderRadius) => void
}) {
  const [linked, setLinked] = useState(true)

  // Extract uniform value or individual corners
  const isObject = typeof borderRadius === 'object' && borderRadius !== null
  const uniform = isObject ? 0 : (borderRadius || 0)
  const corners = isObject
    ? borderRadius
    : { topLeft: uniform, topRight: uniform, bottomRight: uniform, bottomLeft: uniform }

  const handleUniform = (val: number) => {
    onChange(val)
  }

  const handleCorner = (corner: keyof typeof corners, val: number) => {
    if (linked) {
      onChange(val)
    } else {
      onChange({ ...corners, [corner]: val })
    }
  }

  const inputClass = "w-full bg-white/5 border border-white/10 rounded px-1.5 py-1 text-white text-[10px] focus:outline-none focus:border-white/30 text-center"

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <MiniLabel>עיגול פינות</MiniLabel>
        <button
          onClick={() => {
            const newLinked = !linked
            setLinked(newLinked)
            if (newLinked && isObject) {
              // Switch to uniform: use average
              const avg = Math.round((corners.topLeft + corners.topRight + corners.bottomRight + corners.bottomLeft) / 4)
              onChange(avg)
            } else if (!newLinked && !isObject) {
              // Switch to per-corner
              onChange({ topLeft: uniform, topRight: uniform, bottomRight: uniform, bottomLeft: uniform })
            }
          }}
          className={`text-[9px] px-1.5 py-0.5 rounded transition-colors ${linked ? 'text-blue-400 bg-blue-500/15' : 'text-gray-500 hover:text-gray-300'}`}
          title={linked ? 'פינות מקושרות — לחץ להפרדה' : 'פינות נפרדות — לחץ לקישור'}
        >
          {linked ? '🔗' : '✂️'}
        </button>
      </div>

      {linked ? (
        <input
          type="number"
          value={uniform}
          onChange={(e) => handleUniform(Math.max(0, parseInt(e.target.value) || 0))}
          className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-white/30"
          dir="ltr"
          min={0}
        />
      ) : (
        <div className="grid grid-cols-2 gap-1">
          <div>
            <span className="text-gray-600 text-[8px]">שמאל-עליון</span>
            <input type="number" value={corners.topLeft} onChange={(e) => handleCorner('topLeft', Math.max(0, parseInt(e.target.value) || 0))} className={inputClass} dir="ltr" min={0} />
          </div>
          <div>
            <span className="text-gray-600 text-[8px]">ימין-עליון</span>
            <input type="number" value={corners.topRight} onChange={(e) => handleCorner('topRight', Math.max(0, parseInt(e.target.value) || 0))} className={inputClass} dir="ltr" min={0} />
          </div>
          <div>
            <span className="text-gray-600 text-[8px]">שמאל-תחתון</span>
            <input type="number" value={corners.bottomLeft} onChange={(e) => handleCorner('bottomLeft', Math.max(0, parseInt(e.target.value) || 0))} className={inputClass} dir="ltr" min={0} />
          </div>
          <div>
            <span className="text-gray-600 text-[8px]">ימין-תחתון</span>
            <input type="number" value={corners.bottomRight} onChange={(e) => handleCorner('bottomRight', Math.max(0, parseInt(e.target.value) || 0))} className={inputClass} dir="ltr" min={0} />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Mask Control ────────────────────────────────────

const MASK_OPTIONS: { type: MaskType; label: string; icon: string }[] = [
  { type: 'none', label: 'ללא', icon: '▢' },
  { type: 'circle', label: 'עיגול', icon: '⬤' },
  { type: 'ellipse', label: 'אליפסה', icon: '⬮' },
  { type: 'diamond', label: 'יהלום', icon: '◆' },
  { type: 'hexagon', label: 'משושה', icon: '⬡' },
  { type: 'star', label: 'כוכב', icon: '★' },
  { type: 'blob', label: 'כתם', icon: '◉' },
  { type: 'arch', label: 'קשת', icon: '⌂' },
]

function MaskControl({ mask, onChange }: {
  mask: MaskConfig | undefined
  onChange: (mask: MaskConfig | undefined) => void
}) {
  const currentType = mask?.type || 'none'

  return (
    <div>
      <MiniLabel>מסיכה</MiniLabel>
      <div className="grid grid-cols-4 gap-1">
        {MASK_OPTIONS.map((opt) => (
          <button
            key={opt.type}
            onClick={() => onChange(opt.type === 'none' ? undefined : { type: opt.type })}
            className={`flex flex-col items-center gap-0.5 px-1 py-1.5 rounded transition-colors text-center ${
              currentType === opt.type
                ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/30'
                : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
            }`}
            title={opt.label}
          >
            <span className="text-sm leading-none">{opt.icon}</span>
            <span className="text-[8px] leading-none">{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
