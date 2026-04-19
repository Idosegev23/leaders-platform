'use client'

import React, { useCallback, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { InfluencersStepData, InfluencerProfile } from '@/types/wizard'
import ResearchContext from '../research-context'

interface StepInfluencersProps {
  data: Partial<InfluencersStepData>
  extractedData: Partial<InfluencersStepData>
  onChange: (data: Partial<InfluencersStepData>) => void
  errors: Record<string, string> | null
  influencerStrategy?: Record<string, unknown> | null
}

function createEmptyInfluencer(): InfluencerProfile {
  return {
    name: '',
    username: '',
    profileUrl: '',
    profilePicUrl: '',
    categories: [],
    followers: 0,
    engagementRate: 0,
  }
}

export default function StepInfluencers({
  data,
  extractedData,
  onChange,
  errors,
  influencerStrategy: influencerResearch,
}: StepInfluencersProps) {
  const influencers = data.influencers ?? []
  const influencerStrategy = data.influencerStrategy ?? ''
  const influencerCriteria = data.influencerCriteria ?? []
  const influencerNote = data.influencerNote ?? ''

  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)

  // Add influencer
  const addInfluencer = useCallback(() => {
    onChange({
      ...data,
      influencers: [...influencers, createEmptyInfluencer()],
    })
    setExpandedIndex(influencers.length)
    setShowAddForm(false)
  }, [data, onChange, influencers])

  // Remove influencer
  const removeInfluencer = useCallback(
    (index: number) => {
      const updated = influencers.filter((_, i) => i !== index)
      onChange({ ...data, influencers: updated })
      if (expandedIndex === index) setExpandedIndex(null)
    },
    [data, onChange, influencers, expandedIndex]
  )

  // Update influencer field
  const updateInfluencer = useCallback(
    (index: number, updates: Partial<InfluencerProfile>) => {
      const updated = [...influencers]
      updated[index] = { ...updated[index], ...updates }
      onChange({ ...data, influencers: updated })
    },
    [data, onChange, influencers]
  )

  // Categories management
  const addCategory = useCallback(
    (index: number, category: string) => {
      const trimmed = category.trim()
      if (!trimmed) return
      const inf = influencers[index]
      const cats = inf.categories || []
      if (cats.includes(trimmed)) return
      updateInfluencer(index, { categories: [...cats, trimmed] })
    },
    [influencers, updateInfluencer]
  )

  const removeCategory = useCallback(
    (infIndex: number, catIndex: number) => {
      const inf = influencers[infIndex]
      updateInfluencer(infIndex, {
        categories: (inf.categories || []).filter((_, i) => i !== catIndex),
      })
    },
    [influencers, updateInfluencer]
  )

  // Age split management
  const addAgeSplit = useCallback(
    (infIndex: number) => {
      const inf = influencers[infIndex]
      updateInfluencer(infIndex, {
        ageSplit: [...(inf.ageSplit || []), { range: '', percent: 0 }],
      })
    },
    [influencers, updateInfluencer]
  )

  const removeAgeSplit = useCallback(
    (infIndex: number, splitIndex: number) => {
      const inf = influencers[infIndex]
      updateInfluencer(infIndex, {
        ageSplit: (inf.ageSplit || []).filter((_, i) => i !== splitIndex),
      })
    },
    [influencers, updateInfluencer]
  )

  const updateAgeSplit = useCallback(
    (infIndex: number, splitIndex: number, field: 'range' | 'percent', value: string | number) => {
      const inf = influencers[infIndex]
      const updated = [...(inf.ageSplit || [])]
      updated[splitIndex] = { ...updated[splitIndex], [field]: value }
      updateInfluencer(infIndex, { ageSplit: updated })
    },
    [influencers, updateInfluencer]
  )

  // Criteria management
  const addCriterion = useCallback(() => {
    onChange({
      ...data,
      influencerCriteria: [...influencerCriteria, ''],
    })
  }, [data, onChange, influencerCriteria])

  const removeCriterion = useCallback(
    (index: number) => {
      const updated = influencerCriteria.filter((_, i) => i !== index)
      onChange({ ...data, influencerCriteria: updated })
    },
    [data, onChange, influencerCriteria]
  )

  const updateCriterion = useCallback(
    (index: number, value: string) => {
      const updated = [...influencerCriteria]
      updated[index] = value
      onChange({ ...data, influencerCriteria: updated })
    },
    [data, onChange, influencerCriteria]
  )

  return (
    <div dir="rtl" className="space-y-10">
      {/* Influencer Cards */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <label className="block text-[13px] font-heebo font-semibold text-wizard-text-secondary tracking-[0.01em]">
            משפיענים ({influencers.length})
          </label>
          <Button variant="ghost" size="sm" onClick={addInfluencer} className="gap-1.5">
            <span className="text-base leading-none">+</span>
            <span>הוסף משפיען</span>
          </Button>
        </div>

        {errors?.influencers && (
          <p className="text-xs text-destructive">{errors.influencers}</p>
        )}

        {influencers.length === 0 && (
          <div className="rounded-2xl border-2 border-dashed border-wizard-border p-8 text-center">
            <p className="text-sm text-wizard-text-tertiary mb-3">
              לא נוספו משפיענים עדיין
            </p>
            <Button variant="secondary" size="sm" onClick={addInfluencer}>
              הוסף משפיען ראשון
            </Button>
          </div>
        )}

        {influencers.map((inf, index) => {
          const isExpanded = expandedIndex === index

          return (
            <Card key={index} className="overflow-hidden">
              {/* Card header - always visible */}
              <button
                type="button"
                onClick={() => setExpandedIndex(isExpanded ? null : index)}
                className="w-full flex items-center gap-3 p-4 text-right hover:bg-brand-pearl transition-colors"
              >
                {/* Profile pic */}
                <div className="w-10 h-10 rounded-full bg-brand-mist flex items-center justify-center shrink-0 overflow-hidden">
                  {inf.profilePicUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={inf.profilePicUrl}
                      alt={inf.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-wizard-text-tertiary"
                    >
                      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-heebo font-bold text-sm text-wizard-text-primary truncate">
                    {inf.name || 'משפיען ללא שם'}
                  </p>
                  <p className="text-xs text-wizard-text-tertiary truncate">
                    {inf.username ? `@${inf.username}` : 'ללא שם משתמש'}
                    {inf.followers > 0 && ` | ${inf.followers.toLocaleString('he-IL')} עוקבים`}
                  </p>
                </div>

                {/* Expand icon */}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={cn(
                    'shrink-0 text-wizard-text-tertiary transition-transform duration-200',
                    isExpanded && 'rotate-180'
                  )}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {/* Expanded form */}
              {isExpanded && (
                <CardContent className="border-t border-wizard-border pt-4 space-y-4">
                  {/* Basic info */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      label="שם"
                      placeholder="שם המשפיען"
                      value={inf.name}
                      onChange={(e) => updateInfluencer(index, { name: e.target.value })}
                    />
                    <Input
                      label="שם משתמש"
                      placeholder="username"
                      value={inf.username}
                      onChange={(e) => updateInfluencer(index, { username: e.target.value })}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      label="קישור לפרופיל"
                      placeholder="https://instagram.com/..."
                      value={inf.profileUrl}
                      onChange={(e) => updateInfluencer(index, { profileUrl: e.target.value })}
                    />
                    <Input
                      label="קישור לתמונת פרופיל"
                      placeholder="https://..."
                      value={inf.profilePicUrl}
                      onChange={(e) => updateInfluencer(index, { profilePicUrl: e.target.value })}
                    />
                  </div>

                  {/* Categories */}
                  <div className="space-y-2">
                    <label className="block text-[13px] font-heebo font-semibold text-wizard-text-secondary tracking-[0.01em]">קטגוריות</label>
                    <div className="flex flex-wrap gap-2">
                      {(inf.categories || []).map((cat, catIndex) => (
                        <span
                          key={catIndex}
                          className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-brand-gold/10 text-sm text-brand-primary"
                        >
                          {cat}
                          <button
                            type="button"
                            onClick={() => removeCategory(index, catIndex)}
                            className="text-brand-primary/60 hover:text-destructive"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        </span>
                      ))}
                    </div>
                    <CategoryInput onAdd={(cat) => addCategory(index, cat)} />
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Input
                      label="עוקבים"
                      type="number"
                      min={0}
                      value={inf.followers || ''}
                      onChange={(e) =>
                        updateInfluencer(index, { followers: parseInt(e.target.value) || 0 })
                      }
                    />
                    <Input
                      label="צפיות סטורי (ממוצע)"
                      type="number"
                      min={0}
                      value={inf.avgStoryViews ?? ''}
                      onChange={(e) =>
                        updateInfluencer(index, {
                          avgStoryViews: e.target.value ? parseInt(e.target.value) : undefined,
                        })
                      }
                    />
                    <Input
                      label="צפיות רילז (ממוצע)"
                      type="number"
                      min={0}
                      value={inf.avgReelViews ?? ''}
                      onChange={(e) =>
                        updateInfluencer(index, {
                          avgReelViews: e.target.value ? parseInt(e.target.value) : undefined,
                        })
                      }
                    />
                    <Input
                      label="אחוז מעורבות"
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      value={inf.engagementRate || ''}
                      onChange={(e) =>
                        updateInfluencer(index, {
                          engagementRate: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                  </div>

                  {/* Audience data */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      label="אחוז קהל ישראלי"
                      type="number"
                      min={0}
                      max={100}
                      value={inf.israeliAudiencePercent ?? ''}
                      onChange={(e) =>
                        updateInfluencer(index, {
                          israeliAudiencePercent: e.target.value
                            ? parseInt(e.target.value)
                            : undefined,
                        })
                      }
                      hint="אחוז מתוך סך העוקבים"
                    />

                    {/* Gender Split */}
                    <div className="space-y-2">
                      <label className="block text-[13px] font-heebo font-semibold text-wizard-text-secondary tracking-[0.01em]">
                        פילוח מגדרי (%)
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          placeholder="גברים"
                          type="number"
                          min={0}
                          max={100}
                          value={inf.genderSplit?.male ?? ''}
                          onChange={(e) =>
                            updateInfluencer(index, {
                              genderSplit: {
                                male: parseInt(e.target.value) || 0,
                                female: inf.genderSplit?.female ?? 0,
                              },
                            })
                          }
                        />
                        <Input
                          placeholder="נשים"
                          type="number"
                          min={0}
                          max={100}
                          value={inf.genderSplit?.female ?? ''}
                          onChange={(e) =>
                            updateInfluencer(index, {
                              genderSplit: {
                                male: inf.genderSplit?.male ?? 0,
                                female: parseInt(e.target.value) || 0,
                              },
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>

                  {/* Age Split */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-[13px] font-heebo font-semibold text-wizard-text-secondary tracking-[0.01em]">
                        פילוח גילאים
                      </label>
                      <Button variant="ghost" size="sm" onClick={() => addAgeSplit(index)} className="gap-1.5">
                        <span className="text-base leading-none">+</span>
                        <span>הוסף טווח</span>
                      </Button>
                    </div>
                    {(inf.ageSplit || []).map((split, splitIndex) => (
                      <div key={splitIndex} className="flex items-center gap-2">
                        <Input
                          placeholder="טווח (לדוגמה: 18-24)"
                          value={split.range}
                          onChange={(e) =>
                            updateAgeSplit(index, splitIndex, 'range', e.target.value)
                          }
                        />
                        <Input
                          placeholder="%"
                          type="number"
                          min={0}
                          max={100}
                          value={split.percent || ''}
                          onChange={(e) =>
                            updateAgeSplit(
                              index,
                              splitIndex,
                              'percent',
                              parseInt(e.target.value) || 0
                            )
                          }
                          className="w-20"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeAgeSplit(index, splitIndex)}
                          className="shrink-0 text-wizard-text-tertiary hover:text-destructive hover:bg-destructive/10"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </Button>
                      </div>
                    ))}
                  </div>

                  {/* Bio */}
                  <Textarea
                    label="ביו (אופציונלי)"
                    placeholder="ביו קצר של המשפיען..."
                    value={inf.bio ?? ''}
                    onChange={(e) => updateInfluencer(index, { bio: e.target.value })}
                    className="min-h-[60px]"
                  />

                  {/* Verified */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={inf.isVerified ?? false}
                      onChange={(e) => updateInfluencer(index, { isVerified: e.target.checked })}
                      className="h-4 w-4 rounded border-wizard-border accent-brand-primary"
                    />
                    <span className="text-sm text-wizard-text-primary">חשבון מאומת</span>
                  </label>

                  {/* Remove button */}
                  <div className="border-t border-wizard-border pt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => removeInfluencer(index)}
                      className="text-destructive border-destructive/30 hover:bg-destructive/5"
                    >
                      הסר משפיען
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>
          )
        })}
      </div>

      {/* Strategy */}
      <Textarea
        label="אסטרטגיית בחירת משפיענים"
        placeholder="מהי הגישה לבחירת המשפיענים? למה הם מתאימים לקמפיין?"
        value={influencerStrategy}
        onChange={(e) => onChange({ ...data, influencerStrategy: e.target.value })}
        error={errors?.influencerStrategy}
        className="min-h-[100px]"
      />

      {/* Criteria */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="block text-[13px] font-heebo font-semibold text-wizard-text-secondary tracking-[0.01em]">
            קריטריונים לבחירה
          </label>
          <Button variant="ghost" size="sm" onClick={addCriterion} className="gap-1.5">
            <span className="text-base leading-none">+</span>
            <span>הוסף קריטריון</span>
          </Button>
        </div>

        {influencerCriteria.length === 0 && (
          <p className="text-sm text-wizard-text-tertiary">
            הוסיפו קריטריונים לבחירת משפיענים (אחוז מעורבות מינימלי, התאמה לקהל יעד וכו&apos;)
          </p>
        )}

        {influencerCriteria.map((criterion, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              placeholder={`קריטריון ${index + 1}`}
              value={criterion}
              onChange={(e) => updateCriterion(index, e.target.value)}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeCriterion(index)}
              className="shrink-0 text-wizard-text-tertiary hover:text-destructive hover:bg-destructive/10"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
            </Button>
          </div>
        ))}
      </div>

      {/* Notes */}
      <Textarea
        label="הערות (אופציונלי)"
        placeholder="הערות נוספות לגבי המשפיענים..."
        value={influencerNote}
        onChange={(e) => onChange({ ...data, influencerNote: e.target.value })}
        error={errors?.influencerNote}
        className="min-h-[80px]"
      />

      {/* ── Research Context ── */}
      {influencerResearch && (
        <ResearchContext
          title="ממצאי מחקר משפיענים"
          items={(() => {
            const tiers = influencerResearch.tiers as { name: string; description?: string; count?: number; budgetPercent?: number }[] | undefined
            const kpis = influencerResearch.expectedKPIs as { metric: string; target?: string; rationale?: string }[] | undefined
            const timeline = influencerResearch.suggestedTimeline as { phase: string; description?: string }[] | undefined
            return [
              { label: 'פלטפורמה דומיננטית', value: influencerResearch.dominantPlatformInIsrael as string },
              { label: 'שכבות משפיענים', value: tiers?.map(t => `${t.name}${t.description ? ` — ${t.description}` : ''}${t.count ? ` (${t.count})` : ''}`) },
              { label: 'KPIs צפויים', value: kpis?.map(k => `${k.metric}${k.target ? `: ${k.target}` : ''}`) },
              { label: 'ציר זמן מוצע', value: timeline?.map(t => `${t.phase}${t.description ? ` — ${t.description}` : ''}`) },
            ]
          })()}
        />
      )}
    </div>
  )
}

// Helper component for adding categories via input
function CategoryInput({ onAdd }: { onAdd: (category: string) => void }) {
  const [value, setValue] = useState('')

  const handleAdd = () => {
    if (value.trim()) {
      onAdd(value.trim())
      setValue('')
    }
  }

  return (
    <div className="flex gap-2">
      <Input
        placeholder="הוסף קטגוריה..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            handleAdd()
          }
        }}
      />
      <Button
        variant="secondary"
        size="sm"
        onClick={handleAdd}
        disabled={!value.trim()}
        className="shrink-0"
      >
        הוסף
      </Button>
    </div>
  )
}
