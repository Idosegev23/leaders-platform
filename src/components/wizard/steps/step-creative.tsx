'use client'

import React, { useCallback, useRef, useState, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { CreativeStepData } from '@/types/wizard'
import BriefQuotePanel from '../brief-quote-panel'
import { extractBriefExcerpt } from '../brief-excerpt-utils'

interface StepCreativeProps {
  data: Partial<CreativeStepData>
  extractedData: Partial<CreativeStepData>
  onChange: (data: Partial<CreativeStepData>) => void
  errors: Record<string, string> | null
  rawBriefText?: string
}

export default function StepCreative({ data, extractedData, onChange, errors, rawBriefText }: StepCreativeProps) {
  const activityTitle = data.activityTitle ?? ''
  const activityConcept = data.activityConcept ?? ''
  const activityDescription = data.activityDescription ?? ''
  const activityApproach = data.activityApproach ?? []
  const activityDifferentiator = data.activityDifferentiator ?? ''
  const referenceImages = data.referenceImages ?? []
  const suggestedReferences = data.suggestedReferences ?? []
  const brandStory = data.brandStory ?? ''
  const toneOfManner = data.toneOfManner ?? ''
  const visualDirection = data.visualDirection ?? ''
  const keyMessages = data.keyMessages ?? []
  const [newMessage, setNewMessage] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)

  const creativeExcerpt = useMemo(
    () => rawBriefText ? extractBriefExcerpt(rawBriefText, 'creative') : null,
    [rawBriefText]
  )

  // Approach items
  const addApproach = useCallback(() => {
    onChange({
      ...data,
      activityApproach: [...activityApproach, { title: '', description: '' }],
    })
  }, [data, onChange, activityApproach])

  const removeApproach = useCallback(
    (index: number) => {
      const updated = activityApproach.filter((_, i) => i !== index)
      onChange({ ...data, activityApproach: updated })
    },
    [data, onChange, activityApproach]
  )

  const updateApproach = useCallback(
    (index: number, field: 'title' | 'description', value: string) => {
      const updated = [...activityApproach]
      updated[index] = { ...updated[index], [field]: value }
      onChange({ ...data, activityApproach: updated })
    },
    [data, onChange, activityApproach]
  )

  // Image upload
  const handleImageUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files || files.length === 0) return

      setIsUploading(true)
      try {
        const formData = new FormData()
        for (let i = 0; i < files.length; i++) {
          formData.append('files', files[i])
        }

        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        })

        if (!res.ok) throw new Error('Upload failed')

        const result = await res.json()
        const newImages = (result.urls || []).map((url: string) => ({
          url,
          caption: '',
        }))

        onChange({
          ...data,
          referenceImages: [...referenceImages, ...newImages],
        })
      } catch (err) {
        console.error('Image upload error:', err)
      } finally {
        setIsUploading(false)
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
      }
    },
    [data, onChange, referenceImages]
  )

  const removeImage = useCallback(
    (index: number) => {
      const updated = referenceImages.filter((_, i) => i !== index)
      onChange({ ...data, referenceImages: updated })
    },
    [data, onChange, referenceImages]
  )

  const updateImageCaption = useCallback(
    (index: number, caption: string) => {
      const updated = [...referenceImages]
      updated[index] = { ...updated[index], caption }
      onChange({ ...data, referenceImages: updated })
    },
    [data, onChange, referenceImages]
  )

  return (
    <div dir="rtl" className="space-y-10">
      {/* Brief quote for creative */}
      {creativeExcerpt && (
        <BriefQuotePanel
          title="הקשר קריאייטיבי מהבריף"
          briefExcerpt={creativeExcerpt}
        />
      )}

      {/* Suggested references from research */}
      {suggestedReferences.length > 0 && (
        <div className="space-y-3">
          <label className="block text-[13px] font-heebo font-semibold text-wizard-text-secondary tracking-[0.01em]">
            רפרנסים מהעולם (מה-AI)
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {suggestedReferences.map((ref, i) => {
              const title = ref.campaign || ref.type || `רפרנס ${i + 1}`
              const subtitle = ref.year ? `${title} · ${ref.year}` : title
              const body = ref.why || ref.description || ''
              const tail = ref.rationale && ref.rationale !== body ? ref.rationale : ''
              return (
                <div key={i} className="rounded-2xl border border-wizard-border bg-brand-pearl/50 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="rounded-md bg-brand-gold/10 px-2 py-0.5 text-[10px] font-rubik font-medium text-brand-primary">
                      {subtitle}
                    </span>
                  </div>
                  <p className="text-[13px] text-wizard-text-primary font-heebo leading-relaxed">{body}</p>
                  {tail && <p className="text-[11px] text-wizard-text-tertiary mt-1.5">{tail}</p>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Brand story */}
      <Textarea
        label="סיפור המותג / נרטיב"
        placeholder="הנרטיב המרכזי של המותג — כפי שעולה מהבריף"
        value={brandStory}
        onChange={(e) => onChange({ ...data, brandStory: e.target.value })}
        className="min-h-[100px]"
      />

      {/* Tone of manner */}
      <Input
        label="טון ומניירה"
        placeholder="רשמי / משחקי / חם / מקצועי / דרמטי / אירוני..."
        value={toneOfManner}
        onChange={(e) => onChange({ ...data, toneOfManner: e.target.value })}
      />

      {/* Visual direction */}
      <Textarea
        label="כיוון ויזואלי"
        placeholder="מילות מפתח ויזואליות: פלטה, מצב רוח, סגנון צילום, טיפוגרפיה..."
        value={visualDirection}
        onChange={(e) => onChange({ ...data, visualDirection: e.target.value })}
        className="min-h-[80px]"
      />

      {/* Key messages */}
      <div className="space-y-2">
        <label className="block text-[13px] font-heebo font-semibold text-wizard-text-secondary tracking-[0.01em]">
          מסרים מרכזיים
        </label>
        <div className="flex flex-wrap gap-2">
          {keyMessages.map((m, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-brand-gold/10 border border-brand-gold/30 px-3 py-1 text-[12px] font-heebo text-brand-primary">
              {m}
              <button
                type="button"
                onClick={() => onChange({ ...data, keyMessages: keyMessages.filter((_, j) => j !== i) })}
                className="text-brand-primary/60 hover:text-destructive"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="מסר מרכזי חדש…"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newMessage.trim()) {
                e.preventDefault()
                onChange({ ...data, keyMessages: [...keyMessages, newMessage.trim()] })
                setNewMessage('')
              }
            }}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (!newMessage.trim()) return
              onChange({ ...data, keyMessages: [...keyMessages, newMessage.trim()] })
              setNewMessage('')
            }}
          >
            +
          </Button>
        </div>
      </div>

      {/* Activity Title */}
      <Input
        label="כותרת הפעילות"
        placeholder="שם הפעילות / הקמפיין הקריאייטיבי"
        value={activityTitle}
        onChange={(e) => onChange({ ...data, activityTitle: e.target.value })}
        error={errors?.activityTitle}
      />

      {/* Activity Concept */}
      <Textarea
        label="קונספט"
        placeholder="תארו את הקונספט הקריאייטיבי - מה הרעיון המרכזי?"
        value={activityConcept}
        onChange={(e) => onChange({ ...data, activityConcept: e.target.value })}
        error={errors?.activityConcept}
        className="min-h-[120px]"
      />

      {/* Activity Description */}
      <Textarea
        label="תיאור הפעילות"
        placeholder="פרטו כיצד הפעילות תתבצע בפועל..."
        value={activityDescription}
        onChange={(e) => onChange({ ...data, activityDescription: e.target.value })}
        error={errors?.activityDescription}
        className="min-h-[120px]"
      />

      {/* Activity Approach */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <label className="block text-[13px] font-heebo font-semibold text-wizard-text-secondary tracking-[0.01em]">
            גישות וכיוונים
          </label>
          <Button variant="ghost" size="sm" onClick={addApproach} className="gap-1.5">
            <span className="text-base leading-none">+</span>
            <span>הוסף גישה</span>
          </Button>
        </div>

        {errors?.activityApproach && (
          <p className="text-xs text-destructive">{errors.activityApproach}</p>
        )}

        {activityApproach.length === 0 && (
          <div className="rounded-2xl border-2 border-dashed border-wizard-border p-6 text-center">
            <p className="text-sm text-wizard-text-tertiary">
              הוסיפו גישות וכיוונים קריאייטיביים לפעילות
            </p>
          </div>
        )}

        {activityApproach.map((approach, index) => (
          <div
            key={index}
            className="rounded-2xl border border-wizard-border bg-white shadow-wizard-sm p-5 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-rubik font-medium text-wizard-text-tertiary">
                גישה {index + 1}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeApproach(index)}
                className="text-wizard-text-tertiary hover:text-destructive hover:bg-destructive/10 text-xs"
              >
                הסר
              </Button>
            </div>

            <Input
              placeholder="כותרת הגישה"
              value={approach.title}
              onChange={(e) => updateApproach(index, 'title', e.target.value)}
            />

            <Textarea
              placeholder="תיאור הגישה..."
              value={approach.description}
              onChange={(e) => updateApproach(index, 'description', e.target.value)}
              className="min-h-[70px]"
            />
          </div>
        ))}
      </div>

      {/* Differentiator */}
      <Textarea
        label="מבדל (אופציונלי)"
        placeholder="מה ייחודי בפעילות הזו? מה מבדיל אותנו מהמתחרים?"
        value={activityDifferentiator}
        onChange={(e) => onChange({ ...data, activityDifferentiator: e.target.value })}
        error={errors?.activityDifferentiator}
        className="min-h-[80px]"
      />

      {/* Reference Images */}
      <div className="space-y-4">
        <label className="block text-[13px] font-heebo font-semibold text-wizard-text-secondary tracking-[0.01em]">
          תמונות רפרנס
        </label>

        <div
          className="rounded-2xl border-2 border-dashed border-wizard-border p-8 text-center cursor-pointer hover:border-brand-primary/30 hover:bg-brand-pearl/50 transition-all duration-200"
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageUpload}
            className="hidden"
          />
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mx-auto text-muted-foreground mb-2"
          >
            <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
            <circle cx="9" cy="9" r="2" />
            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
          </svg>
          {isUploading ? (
            <p className="text-sm text-muted-foreground">מעלה תמונות...</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">לחצו להעלאת תמונות רפרנס</p>
              <p className="text-xs text-muted-foreground mt-1">PNG, JPG, WebP</p>
            </>
          )}
        </div>

        {/* Image thumbnails */}
        {referenceImages.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {referenceImages.map((img, index) => (
              <div
                key={index}
                className="relative group rounded-lg border border-input overflow-hidden"
              >
                <div className="aspect-video bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url}
                    alt={img.caption || `רפרנס ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-2">
                  <input
                    type="text"
                    placeholder="כיתוב..."
                    value={img.caption ?? ''}
                    onChange={(e) => updateImageCaption(index, e.target.value)}
                    className="w-full text-xs bg-transparent border-none outline-none placeholder:text-muted-foreground"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeImage(index)}
                  className="absolute top-1 left-1 w-6 h-6 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  x
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
