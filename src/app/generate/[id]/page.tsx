'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import FlowStepper from '@/components/flow-stepper'
import { toast } from 'sonner'
import { PRESENTATION_TEMPLATES } from '@/lib/templates/presentation-templates'

// ── Progress weights — how much of the 100% bar each phase takes ──
const PHASE_WEIGHTS = {
  research: 8,
  visuals: 8,
  foundation: 12,
  batches: 65, // 3 parallel batches, ~5 slides each
  finalize: 7,
}

const TIPS = [
  'הארט דיירקטור שלנו מעצב כל שקף בנפרד עם תשומת לב לפרטים',
  'כל מצגת עוברת 6 שלבי עיבוד — כמו סטודיו עיצוב אמיתי',
  'אנחנו משתמשים ב-32 טכניקות עיצוב מתקדמות',
  'כל שקף מקבל Layout Strategy ייחודי בהתאם לתוכן שלו',
  'מערכת הבדיקה שלנו מוודאת ניגודיות, היררכיה ואיזון ויזואלי',
  'צבעי המותג מנותחים ומותאמים לנגישות WCAG',
  'הטיפוגרפיה מותאמת אוטומטית לעברית RTL',
  'כל שקף מקבל ציון איכות ותיקונים אוטומטיים',
  'המערכת בוחרת טכניקת לייאאוט שונה לכל שקף — Brutalism, Bento, Swiss Grid',
  'המצגת שלך תהיה ברמת Awwwards — עיצוב שזוכה בפרסים',
  'אנחנו מייצרים שכבות עומק — 5 רמות Z-Index לעומק ויזואלי',
  'מערכת הפייסינג שלנו יוצרת מסע רגשי לאורך המצגת',
]

interface StepInfo {
  key: string
  label: string
}

/** Safely parse API response — handles Vercel timeout (returns plain text) */
async function safeJson(res: Response): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const text = await res.text()
  try {
    return { ok: res.ok, data: JSON.parse(text) }
  } catch {
    // Vercel timeout or non-JSON error
    const msg = text.slice(0, 200) || `HTTP ${res.status}`
    return { ok: false, data: { error: msg, details: `Server returned non-JSON response (status ${res.status})` } }
  }
}

/**
 * Fetch wrapper that retries transient client-side network failures only —
 * ERR_NETWORK_CHANGED, "Failed to fetch", offline blips. The deck pipeline
 * is long enough (3-5 min) that a single Wi-Fi sleep/wake or VPN toggle
 * will kill an in-flight request; without retry, all 3 parallel batches
 * fail simultaneously and the user has to start over.
 *
 * Server errors (4xx/5xx with a real response) are NOT retried — those
 * are returned to the caller so it can surface them properly.
 */
async function fetchWithNetworkRetry(
  url: string,
  init: RequestInit,
  label: string,
  maxAttempts = 3,
): Promise<Response> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fetch(url, init)
    } catch (err) {
      lastErr = err
      const isNetworkBlip =
        err instanceof TypeError ||
        (err instanceof Error && /network|fetch|offline/i.test(err.message))
      if (!isNetworkBlip || attempt === maxAttempts) throw err
      const backoffMs = 1000 * Math.pow(2, attempt - 1) // 1s, 2s, 4s
      console.warn(`[Generate] ${label} network blip (attempt ${attempt}/${maxAttempts}), retrying in ${backoffMs}ms:`, err)
      await new Promise((r) => setTimeout(r, backoffMs))
    }
  }
  throw lastErr
}

export default function GeneratePage() {
  const params = useParams()
  const router = useRouter()
  const documentId = params.id as string

  // Core state
  const [stage, setStage] = useState('loading')
  const [batchIndex, setBatchIndex] = useState(-1)
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [tipIndex, setTipIndex] = useState(0)
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [showTemplates, setShowTemplates] = useState(false)
  const generationStartedRef = useRef(false)

  // Dynamic batch info — set after foundation
  const [batchCount, setBatchCount] = useState(0)
  const [batchSizes, setBatchSizes] = useState<number[]>([])
  const [totalSlides, setTotalSlides] = useState(0)
  const [slidesDone, setSlidesDone] = useState(0)

  // Overall progress 0-100 (smooth)
  const [progress, setProgress] = useState(0)
  const progressTargetRef = useRef(0)
  const progressAnimRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Timer refs
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const tipRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Smooth progress animation ──
  // When target changes, smoothly animate toward it
  const animateProgressTo = useCallback((target: number) => {
    progressTargetRef.current = Math.min(target, 100)
    if (progressAnimRef.current) return // already running
    progressAnimRef.current = setInterval(() => {
      setProgress(prev => {
        const diff = progressTargetRef.current - prev
        if (Math.abs(diff) < 0.5) {
          if (progressAnimRef.current) {
            clearInterval(progressAnimRef.current)
            progressAnimRef.current = null
          }
          return progressTargetRef.current
        }
        // Ease toward target — faster when far, slower when close
        return prev + diff * 0.15
      })
    }, 100)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (progressAnimRef.current) clearInterval(progressAnimRef.current)
    }
  }, [])

  // ── Elapsed timer — runs from first stage until done/error ──
  useEffect(() => {
    if (stage !== 'done' && stage !== 'error') {
      // Start timer on ANY active stage (including 'loading')
      if (!elapsedRef.current) {
        setElapsed(0)
        elapsedRef.current = setInterval(() => setElapsed(prev => prev + 1), 1000)
      }
    } else {
      // Stop on done/error
      if (elapsedRef.current) {
        clearInterval(elapsedRef.current)
        elapsedRef.current = null
      }
    }
    return () => {
      if (elapsedRef.current) clearInterval(elapsedRef.current)
    }
  }, [stage])

  // ── Tips rotation ──
  useEffect(() => {
    tipRef.current = setInterval(() => {
      setTipIndex(prev => (prev + 1) % TIPS.length)
    }, 6000)
    return () => { if (tipRef.current) clearInterval(tipRef.current) }
  }, [])

  // ── Helper: calculate progress % for a given phase ──
  const getPhaseStart = useCallback((phase: string, bIdx?: number) => {
    let start = 0
    if (phase === 'research') return start
    start += PHASE_WEIGHTS.research
    if (phase === 'visuals') return start
    start += PHASE_WEIGHTS.visuals
    if (phase === 'foundation') return start
    start += PHASE_WEIGHTS.foundation
    if (phase === 'batch' && bIdx !== undefined && batchCount > 0) {
      const perBatch = PHASE_WEIGHTS.batches / batchCount
      return start + perBatch * bIdx
    }
    if (phase === 'finalize') return start + PHASE_WEIGHTS.batches
    if (phase === 'done') return 100
    return start
  }, [batchCount])

  // ── MAIN GENERATION FLOW ──
  const runGeneration = useCallback(async () => {
    if (generationStartedRef.current) return
    generationStartedRef.current = true

    try {
      // 1. Load document
      setStage('loading')
      const docRes = await fetch(`/api/documents/${documentId}`)
      if (!docRes.ok) throw new Error('Failed to load document')
      const docData = await docRes.json()
      const data = docData.document?.data || docData.data || {}
      const pipelineStatus = data._pipelineStatus || {}
      const brandName = data.brandName || ''

      // Check if presentation already exists (HTML-native or AST)
      const htmlPres = data._htmlPresentation as { htmlSlides?: string[] } | undefined
      if (htmlPres?.htmlSlides?.length || data._presentation?.slides?.length > 0) {
        console.log(`[Generate] Presentation already exists (${htmlPres?.htmlSlides?.length || data._presentation?.slides?.length} slides), redirecting to editor`)
        animateProgressTo(100)
        setStage('done')
        setTimeout(() => router.push(`/edit/${documentId}`), 1000)
        return
      }

      // Resume: check if foundation already exists (refresh mid-generation)
      const existingPipeline = data._pipeline as { foundation?: { batches?: number[][]; totalSlides?: number; batchSizes?: number[] }; htmlBatchResults?: unknown[]; status?: string } | undefined
      if (existingPipeline?.foundation && existingPipeline.status !== 'complete') {
        const completedBatches = (existingPipeline.htmlBatchResults || []).filter(Boolean).length
        const totalBatches = existingPipeline.foundation.batches?.length || 3
        if (completedBatches > 0 && completedBatches < totalBatches) {
          console.log(`[Generate] Resuming: ${completedBatches}/${totalBatches} batches complete`)
          // Skip to remaining batches
          const f = existingPipeline.foundation
          setBatchCount(totalBatches)
          setTotalSlides(f.totalSlides || 15)
          setBatchSizes(f.batchSizes || [5, 5, 5])
          setSlidesDone(completedBatches * 5)
          animateProgressTo(30 + (completedBatches / totalBatches) * 65)
          // Don't return — continue to batch generation below which will skip completed batches
        }
      }

      // Check if background generation is in progress
      const bgPipeline = data._pipeline as { status?: string; mode?: string; progress?: number; currentSlide?: number; totalSlides?: number } | undefined
      if (bgPipeline?.mode === 'background' && bgPipeline?.status === 'generating') {
        console.log('[Generate] Background generation in progress, polling...')
        setStage('batch')
        if (bgPipeline.totalSlides) setTotalSlides(bgPipeline.totalSlides)
        if (bgPipeline.currentSlide) {
          setBatchIndex(bgPipeline.currentSlide - 1)
          setSlidesDone(bgPipeline.currentSlide)
        }
        animateProgressTo(bgPipeline.progress || 20)
        // Poll for completion
        const pollInterval = setInterval(async () => {
          const pollRes = await fetch(`/api/documents/${documentId}`)
          const pollData = await pollRes.json()
          const pollDoc = pollData.document?.data || pollData.data || {}
          if (pollDoc._presentation?.slides?.length > 0) {
            clearInterval(pollInterval)
            animateProgressTo(100)
            setStage('done')
            setTimeout(() => router.push(`/edit/${documentId}`), 1000)
          } else if (pollDoc._pipeline?.status === 'error') {
            clearInterval(pollInterval)
            throw new Error(pollDoc._pipeline.error || 'Background generation failed')
          } else if (pollDoc._pipeline?.currentSlide) {
            setSlidesDone(pollDoc._pipeline.currentSlide)
            setBatchIndex(pollDoc._pipeline.currentSlide - 1)
            animateProgressTo(pollDoc._pipeline.progress || 20)
          }
        }, 5000)
        return
      }

      // 2. Research
      if (pipelineStatus.research === 'pending') {
        setStage('research')
        animateProgressTo(PHASE_WEIGHTS.research * 0.5)
        console.log('[Generate] Running deferred research...')

        const extracted = data._extractedData || {}
        const brand = extracted.brand || {}
        const targetAudience = extracted.targetAudience || {}

        const results = await Promise.allSettled([
          fetch('/api/research', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ brandName }),
          }).then(res => res.ok ? res.json() : Promise.reject('Research failed')),
          fetch('/api/influencers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mode: 'research',
              brandResearch: {
                brandName,
                industry: brand.industry || '',
                targetDemographics: {
                  primaryAudience: {
                    gender: targetAudience.primary?.gender || '',
                    ageRange: targetAudience.primary?.ageRange || '',
                    interests: targetAudience.primary?.interests || [],
                  },
                },
              },
              budget: extracted.budget?.amount || 0,
              goals: extracted.campaignGoals || [],
            }),
          }).then(res => res.ok ? res.json() : Promise.reject('Influencer research failed')),
        ])

        const patchData: Record<string, unknown> = {
          _pipelineStatus: { ...pipelineStatus, research: 'complete' },
        }
        if (results[0].status === 'fulfilled') {
          patchData._brandResearch = results[0].value.research
          if (results[0].value.colors) patchData._brandColors = results[0].value.colors
        }
        if (results[1].status === 'fulfilled') {
          patchData._influencerStrategy = results[1].value.strategy || results[1].value
        }

        await fetch(`/api/documents/${documentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patchData),
        })
        console.log('[Generate] Research saved')
      }
      animateProgressTo(PHASE_WEIGHTS.research)

      // 3. Visual assets
      if (pipelineStatus.visualAssets !== 'complete') {
        setStage('visuals')
        animateProgressTo(getPhaseStart('visuals') + PHASE_WEIGHTS.visuals * 0.3)
        console.log('[Generate] Generating visual assets...')

        const freshDocRes = await fetch(`/api/documents/${documentId}`)
        const freshDocData = await freshDocRes.json()
        const freshData = freshDocData.document?.data || freshDocData.data || {}
        const websiteUrl = freshData._brandResearch?.website || freshData._extractedData?.brand?.website || null

        try {
          const visualRes = await fetch('/api/generate-visual-assets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              brandName: freshData.brandName || '',
              brandResearch: freshData._brandResearch,
              stepData: freshData._stepData,
              websiteUrl,
            }),
          })

          if (visualRes.ok) {
            const visualAssets = await visualRes.json()
            const patchVisuals: Record<string, unknown> = {
              _pipelineStatus: { ...freshData._pipelineStatus, visualAssets: 'complete' },
            }
            if (visualAssets.scraped) patchVisuals._scraped = visualAssets.scraped
            if (visualAssets.brandColors?.primary) patchVisuals._brandColors = visualAssets.brandColors
            if (visualAssets.generatedImages) patchVisuals._generatedImages = visualAssets.generatedImages
            if (visualAssets.extraImages?.length) patchVisuals._extraImages = visualAssets.extraImages
            if (visualAssets.imageStrategy) patchVisuals._imageStrategy = visualAssets.imageStrategy

            await fetch(`/api/documents/${documentId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(patchVisuals),
            })
            console.log('[Generate] Visual assets saved')
          }
        } catch (visualErr) {
          console.error('[Generate] Visual assets failed (continuing):', visualErr)
        }
      }
      animateProgressTo(getPhaseStart('foundation'))

      // 4. Check for cached presentation
      const cachedCheckRes = await fetch(`/api/documents/${documentId}`)
      const cachedCheckData = await cachedCheckRes.json()
      const cachedData = cachedCheckData.document?.data || cachedCheckData.data || {}

      if (cachedData._presentation?.slides?.length > 0) {
        console.log('[Generate] Using cached presentation')
        animateProgressTo(100)
        setStage('done')
        setTimeout(() => router.push(`/edit/${documentId}`), 1500)
        return
      }

      // 5. STAGED SLIDE GENERATION

      // 5a: Foundation
      setStage('foundation')
      animateProgressTo(getPhaseStart('foundation') + PHASE_WEIGHTS.foundation * 0.5)
      console.log('[Generate] Running foundation...')

      const foundationRes = await fetchWithNetworkRetry('/api/generate-slides-stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId, stage: 'foundation', templateId: selectedTemplate }),
      }, 'foundation')

      const { ok: foundationOk, data: foundationData } = await safeJson(foundationRes)
      if (!foundationOk) {
        throw new Error((foundationData.details || foundationData.error || 'Foundation failed') as string)
      }
      const ts = (foundationData.totalSlides as number) || 12
      const bc = (foundationData.batchCount as number) || 3
      const sizes = (foundationData.batchSizes as number[]) || [5, 5, 5]

      setBatchCount(bc)
      setTotalSlides(ts)
      setBatchSizes(sizes)
      setSlidesDone(0)
      animateProgressTo(getPhaseStart('foundation') + PHASE_WEIGHTS.foundation)
      console.log(`[Generate] Foundation complete: ${ts} slides in ${bc} batches (${sizes.join(', ')})`)

      // 5b: Batch generation — ALL batches in PARALLEL (40% faster)
      const batchesStart = PHASE_WEIGHTS.research + PHASE_WEIGHTS.visuals + PHASE_WEIGHTS.foundation

      setStage('batch')
      setBatchIndex(0)
      animateProgressTo(batchesStart + PHASE_WEIGHTS.batches * 0.1)
      console.log(`[Generate] Launching ${bc} batches in PARALLEL...`)

      const batchPromises = Array.from({ length: bc }, (_, b) =>
        fetchWithNetworkRetry('/api/generate-slides-stage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ documentId, stage: 'batch', batchIndex: b }),
        }, `batch ${b + 1}`)
          .then(async res => {
            const { ok, data } = await safeJson(res)
            if (!ok) throw new Error((data.details || data.error || `Batch ${b + 1} failed`) as string)
            console.log(`[Generate] Batch ${b + 1}/${bc} done (${data.slidesGenerated} slides)`)
            // Update progress as each batch completes
            const perBatch = PHASE_WEIGHTS.batches / bc
            setSlidesDone(prev => prev + ((data.slidesGenerated as number) || sizes[b] || 5))
            setBatchIndex(b)
            animateProgressTo(batchesStart + perBatch * (b + 1))
            return data
          })
      )

      const batchResults = await Promise.allSettled(batchPromises)
      const failedBatches = batchResults.filter(r => r.status === 'rejected')
      if (failedBatches.length === bc) {
        throw new Error('כל הבאצ׳ים נכשלו — נסה שוב')
      }
      if (failedBatches.length > 0) {
        console.warn(`[Generate] ${failedBatches.length}/${bc} batches failed, continuing with partial results`)
      }

      const totalAccumulated = batchResults.reduce((sum, r) =>
        r.status === 'fulfilled' ? sum + ((r.value.slidesGenerated as number) || 5) : sum, 0
      )
      setSlidesDone(totalAccumulated)
      animateProgressTo(batchesStart + PHASE_WEIGHTS.batches)

      // 5c: Finalize
      setStage('finalize')
      setBatchIndex(-1)
      animateProgressTo(getPhaseStart('finalize') + PHASE_WEIGHTS.finalize * 0.3)
      console.log('[Generate] Finalizing presentation...')

      const finalizeRes = await fetchWithNetworkRetry('/api/generate-slides-stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId, stage: 'finalize' }),
      }, 'finalize')

      const { ok: finalizeOk, data: finalData } = await safeJson(finalizeRes)
      if (!finalizeOk) {
        throw new Error((finalData.details || finalData.error || 'Finalize failed') as string)
      }
      setSlidesDone(ts)
      animateProgressTo(100)
      console.log(`[Generate] Finalized: ${finalData.slideCount} slides, quality: ${finalData.qualityScore ?? '-'}/100`)

      // Update pipeline status
      await fetch(`/api/documents/${documentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          _pipelineStatus: {
            textGeneration: 'complete',
            research: 'complete',
            visualAssets: 'complete',
            slideGeneration: 'complete',
          },
        }),
      })

      // Auto-schedule follow-up reminder (3 Israeli business days)
      try {
        const docRes2 = await fetch(`/api/documents/${documentId}`)
        const docData2 = await docRes2.json()
        const bn = docData2?.document?.data?.brandName || docData2?.data?.brandName || ''
        if (bn) {
          fetch('/api/follow-up', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ brandName: bn, proposalType: 'presentation', businessDays: 3 }),
          }).then(r => r.json()).then(d => {
            if (d.success) console.log(`[Generate] Follow-up scheduled for ${d.formattedDate}`)
            else console.warn('[Generate] Follow-up failed:', d.error)
          }).catch(() => { /* non-critical */ })
        }
      } catch { /* follow-up is non-critical */ }

      // Also generate structured (gamma) version for the new editor
      try {
        console.log('[Generate] Starting gamma generation (structured format for new editor)')
        const gammaRes = await fetch('/api/gamma-prototype', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ documentId }),
        })
        const gammaJson = await gammaRes.json()
        if (gammaJson.success && gammaJson.presentation) {
          await fetch(`/api/documents/${documentId}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ _structuredPresentation: gammaJson.presentation }),
          })
          console.log(`[Generate] ✅ Gamma version saved — ${gammaJson.slideCount} slides`)
          setStage('done')
          setTimeout(() => router.push(`/edit/${documentId}`), 1500)
          return
        }
        console.warn('[Generate] Gamma generation failed, falling back to HTML editor')
      } catch (gammaErr) {
        console.warn('[Generate] Gamma generation error, falling back:', gammaErr)
      }

      setStage('done')
      setTimeout(() => router.push(`/edit/${documentId}`), 1500)
    } catch (err) {
      console.error('[Generate] Error:', err)
      setStage('error')
      setError(err instanceof Error ? err.message : 'שגיאה ביצירת המצגת')
    }
  }, [documentId, router, animateProgressTo, getPhaseStart])

  useEffect(() => {
    runGeneration()
  }, [runGeneration])

  // ── Build dynamic steps — group slides into visual chunks ──
  const progressSteps: StepInfo[] = [
    { key: 'research', label: 'מחקר' },
    { key: 'visuals', label: 'ויזואליה' },
    { key: 'foundation', label: 'מערכת עיצוב' },
  ]

  if (batchCount > 0) {
    for (let b = 0; b < batchCount; b++) {
      progressSteps.push({
        key: `batch_${b}`,
        label: `באצ׳ ${b + 1}`,
      })
    }
  } else {
    progressSteps.push({ key: 'batch_0', label: 'עיצוב שקפים' })
  }

  progressSteps.push({ key: 'finalize', label: 'בדיקות' })

  // ── Step status logic ──
  function getStepStatus(stepKey: string): 'pending' | 'active' | 'done' {
    const order = ['research', 'visuals', 'foundation']
    if (batchCount > 0) {
      for (let b = 0; b < batchCount; b++) order.push(`batch_${b}`)
    } else {
      order.push('batch_0')
    }
    order.push('finalize', 'done')

    // Map current stage to a key
    let currentKey = stage
    if (stage === 'batch' && batchIndex >= 0) {
      currentKey = `batch_${batchIndex}`
    }

    const stepIdx = order.indexOf(stepKey)
    const currentIdx = order.indexOf(currentKey)

    if (stepIdx < 0) return 'pending'
    if (currentIdx > stepIdx) return 'done'
    if (currentIdx === stepIdx) return 'active'
    return 'pending'
  }

  // ── Stage display metadata ──
  const getStageLabel = (): string => {
    if (stage === 'loading') return 'טוען נתונים...'
    if (stage === 'research') return 'מחקר מותג ומשפיענים'
    if (stage === 'visuals') return 'יצירת שפה ויזואלית ותמונות'
    if (stage === 'foundation') return 'בניית כיוון קריאייטיבי ומערכת עיצוב'
    if (stage === 'batch' && batchIndex >= 0) {
      return `מעצב באצ׳ ${batchIndex + 1} מתוך ${batchCount} (${batchSizes[batchIndex] || '?'} שקפים)`
    }
    if (stage === 'finalize') return 'בדיקת איכות והרכבה סופית'
    if (stage === 'done') return 'המצגת מוכנה!'
    if (stage === 'error') return 'שגיאה'
    return ''
  }

  const getStageSubtitle = (): string => {
    if (stage === 'loading') return 'מכין את כל הנתונים'
    if (stage === 'research') return 'סורק את הרשת למחקר שוק ואיתור משפיעני מפתח'
    if (stage === 'visuals') return 'מנתח שפה ויזואלית, לוגו, צבעים ותמונות מהאתר'
    if (stage === 'foundation') return 'ארט דיירקטור AI בונה מערכת עיצוב, טיפוגרפיה ואפקטים'
    if (stage === 'batch' && batchIndex >= 0) {
      return `כל באצ׳ מעוצב במקביל — באצ׳ ${batchIndex + 1} מתוך ${batchCount}`
    }
    if (stage === 'finalize') return 'מוודא ניגודיות, היררכיה, איזון ויזואלי ועקביות'
    if (stage === 'done') return 'מנווט לתצוגת מצגת...'
    if (stage === 'error') return 'משהו השתבש'
    return ''
  }

  const showTimer = stage !== 'done' && stage !== 'error' && stage !== 'loading'
  const roundedProgress = Math.round(progress)

  return (
    <div dir="rtl" className="min-h-screen bg-[#f4f5f7] font-sans flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-[#dfdfdf] bg-white/80 backdrop-blur-md">
        <div className="flex items-center justify-between px-6 py-4 max-w-[1200px] mx-auto">
          <div className="flex items-center gap-3">
            <Image src="/logoblack.png" alt="Leaders" width={120} height={36} className="h-8 w-auto hover:opacity-80 transition-opacity" />
          </div>
          <div className="hidden sm:block">
            <FlowStepper currentStep="generate" compact />
          </div>
          <div />
        </div>
      </header>

      {/* Template selector — visible during loading */}
      {stage === 'loading' && !generationStartedRef.current && (
        <div className="max-w-[1000px] mx-auto px-4 pt-6">
          <button
            onClick={() => setShowTemplates(!showTemplates)}
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-2 mb-3"
          >
            🎨 בחר סגנון מצגת (אופציונלי)
            <span className="text-xs">{showTemplates ? '▲' : '▼'}</span>
            {selectedTemplate && <span className="text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full">{PRESENTATION_TEMPLATES.find(t => t.id === selectedTemplate)?.name}</span>}
          </button>
          {showTemplates && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 animate-in fade-in duration-300">
              {PRESENTATION_TEMPLATES.map(t => (
                <button
                  key={t.id}
                  onClick={() => { setSelectedTemplate(selectedTemplate === t.id ? null : t.id); setShowTemplates(false) }}
                  className={`text-right p-3 rounded-xl border transition-all ${selectedTemplate === t.id ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-300' : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'}`}
                >
                  <div className="text-2xl mb-1">{t.thumbnail}</div>
                  <div className="font-bold text-sm text-gray-800">{t.name}</div>
                  <div className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{t.description}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-[800px]">
          {/* Hero Card */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0f172a] via-[#1e1b4b] to-[#020617] text-white p-8 md:p-10 shadow-2xl border border-white/10">
            {/* Decorative rings */}
            <svg className="absolute top-0 left-0 w-full h-full opacity-15 pointer-events-none" viewBox="0 0 800 500" fill="none">
              <circle cx="650" cy="250" r="100" stroke="#f2cc0d" strokeWidth="1.5" className="animate-[spin_20s_linear_infinite] origin-[650px_250px]" strokeDasharray="10 20" />
              <circle cx="650" cy="250" r="160" stroke="#f2cc0d" strokeWidth="0.8" opacity="0.3" />
            </svg>

            <div className="relative z-10">
              {/* Header row */}
              <div className="flex items-start justify-between mb-6">
                <div className="flex-1 min-w-0">
                  <h2 className="text-2xl font-extrabold tracking-tight">
                    {getStageLabel()}
                  </h2>
                  <p className="text-[#94a3b8] text-sm mt-1 font-medium">
                    {getStageSubtitle()}
                  </p>
                </div>
                {showTimer && (
                  <div className="text-left shrink-0 bg-black/30 backdrop-blur-sm px-4 py-2 rounded-xl border border-white/5 mr-4">
                    <div className="text-3xl font-mono font-bold tabular-nums text-[#f2cc0d] drop-shadow-[0_0_8px_rgba(242,204,13,0.5)]">
                      {Math.floor(elapsed / 60).toString().padStart(2, '0')}:{(elapsed % 60).toString().padStart(2, '0')}
                    </div>
                    <p className="text-[#94a3b8] text-xs font-semibold tracking-wider text-center mt-1">זמן ריצה</p>
                  </div>
                )}
              </div>

              {/* Overall progress bar */}
              {showTimer && (
                <div className="mb-4">
                  <div className="flex items-center gap-3 mb-1.5">
                    <div className="flex-1 h-2.5 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-l from-[#f2cc0d] to-[#f59e0b] transition-[width] duration-300 ease-out"
                        style={{ width: `${roundedProgress}%` }}
                      />
                    </div>
                    <span className="text-[#f2cc0d] text-sm font-bold tabular-nums shrink-0 min-w-[3ch] text-left">
                      {roundedProgress}%
                    </span>
                  </div>
                  {/* Slide counter under progress bar */}
                  {totalSlides > 0 && (
                    <div className="flex justify-between text-xs text-white/40 font-medium px-0.5">
                      <span>{slidesDone}/{totalSlides} שקפים הושלמו</span>
                      <span>{batchCount} באצ׳ים במקביל</span>
                    </div>
                  )}
                </div>
              )}

              {/* Progress Steps — dynamic horizontal pills */}
              <div className="flex items-center gap-1 mb-6 overflow-x-auto scrollbar-none" style={{ scrollbarWidth: 'none' }}>
                {progressSteps.map((step, i) => {
                  const status = getStepStatus(step.key)
                  return (
                    <div key={step.key} className="flex items-center gap-1 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold transition-all duration-500 ${
                          status === 'done'
                            ? 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/30'
                            : status === 'active'
                            ? 'bg-[#f2cc0d] text-[#0f172a] shadow-[0_0_15px_rgba(242,204,13,0.4)] scale-110'
                            : 'bg-white/5 text-white/25 border border-white/5'
                        }`}>
                          {status === 'done' ? (
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          ) : status === 'active' ? (
                            <div className="relative flex items-center justify-center w-full h-full">
                              <div className="absolute inset-0 rounded-xl border-2 border-[#0f172a] border-t-transparent animate-spin" />
                              <span className="text-[10px]">{i + 1}</span>
                            </div>
                          ) : (
                            <span className="text-[10px]">{i + 1}</span>
                          )}
                        </div>
                        <span className={`text-xs font-bold hidden md:inline tracking-wide whitespace-nowrap ${
                          status === 'done' ? 'text-[#10b981]' :
                          status === 'active' ? 'text-[#f2cc0d]' :
                          'text-white/25'
                        }`}>{step.label}</span>
                      </div>
                      {i < progressSteps.length - 1 && (
                        <div className="w-3 h-0.5 rounded-full mx-0.5 transition-colors duration-500" style={{
                          backgroundColor: status === 'done' ? '#10b98140' : 'rgba(255,255,255,0.08)',
                        }} />
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Tips rotation */}
              {showTimer && (
                <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 transition-all duration-500">
                  <div className="flex items-start gap-2">
                    <span className="text-[#f2cc0d] text-sm shrink-0">💡</span>
                    <p className="text-white/60 text-sm leading-relaxed">{TIPS[tipIndex]}</p>
                  </div>
                </div>
              )}

              {/* Background mode button — visible after foundation completes */}
              {stage === 'batch' && totalSlides > 0 && (
                <button
                  onClick={async () => {
                    try {
                      fetch('/api/generate-background', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ documentId }),
                      })
                      toast.success('ההפקה ממשיכה ברקע — תוכלו לראות את הסטטוס בדשבורד')
                      setTimeout(() => router.push('/dashboard'), 1500)
                    } catch {
                      toast.error('שגיאה בהפעלת הפקה ברקע')
                    }
                  }}
                  className="w-full mt-3 py-2.5 px-4 text-sm font-medium text-white/50 hover:text-white/80 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 transition-all text-center"
                >
                  המשך ברקע — אחזור כשמוכן
                </button>
              )}

              {/* Done celebration */}
              {stage === 'done' && (
                <div className="text-center py-4 animate-in fade-in zoom-in-95 duration-500">
                  <div className="w-16 h-16 rounded-full bg-[#10b981]/20 mx-auto mb-4 flex items-center justify-center">
                    <svg className="w-8 h-8 text-[#10b981]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-white/70 text-sm">מעביר לתצוגת מצגת...</p>
                </div>
              )}
            </div>
          </div>

          {/* Error state */}
          {stage === 'error' && error && (
            <div className="bg-red-50 border-2 border-red-200 text-red-800 rounded-2xl p-6 mt-6 shadow-sm">
              <div className="flex items-center gap-3 font-bold text-lg mb-2 text-red-600">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                שגיאת מערכת
              </div>
              <p className="font-medium text-red-700 mr-9">{error}</p>
              <div className="flex gap-3 mt-4 mr-9">
                <button
                  className="bg-red-100 hover:bg-red-200 text-red-800 font-bold py-2 px-5 rounded-full transition-colors"
                  onClick={() => {
                    setStage('loading')
                    setError(null)
                    setProgress(0)
                    progressTargetRef.current = 0
                    setSlidesDone(0)
                    setTotalSlides(0)
                    setBatchCount(0)
                    setBatchSizes([])
                    setBatchIndex(-1)
                    generationStartedRef.current = false
                    runGeneration()
                  }}
                >
                  נסה שוב
                </button>
                <button
                  className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold py-2 px-5 rounded-full transition-colors"
                  onClick={() => router.push(`/wizard/${documentId}`)}
                >
                  חזרה לעורך
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
