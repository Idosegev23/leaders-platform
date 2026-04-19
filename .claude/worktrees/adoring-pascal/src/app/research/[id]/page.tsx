'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import { enrichStepData } from '@/components/wizard/wizard-utils'
import FlowStepper from '@/components/flow-stepper'

type ResearchStage =
  | 'loading'
  | 'brand_research'
  | 'influencer_research'
  | 'reviewing'   // מחקר הסתיים — משתמש מעיין ומחליט
  | 'building'    // משתמש אישר — בונה תוכן wizard
  | 'done'        // הכל הסתיים
  | 'error'

const RESEARCH_STEPS = [
  { key: 'loading', label: 'טוען נתונים' },
  { key: 'brand_research', label: 'מחקר מותג' },
  { key: 'influencer_research', label: 'מחקר משפיענים' },
  { key: 'reviewing', label: 'סקירה ואישור' },
]

// Labels for the 4 consolidated research agents (must match getResearchAngles() order in brand-research.ts)
const AGENT_LABELS = [
  'חברה ושוק',
  'קהל יעד',
  'דיגיטל וקמפיינים',
  'שוק ישראלי וזהות',
]
const AGENT_COUNT = AGENT_LABELS.length

const INFLUENCER_STAGES = [
  'מנתח נישת המותג...',
  'מאתר משפיענים רלוונטיים...',
  'בודק פרופילים...',
  'בונה אסטרטגיית משפיענים...',
  'מכין המלצות...',
]

const GENERIC_TIPS = [
  'נתון אמת: קמפיין משפיענים מקצועי מייצר החזר השקעה (ROI) ממוצע של $5.20 על כל דולר שמושקע.',
  '82% מהצרכנים מעידים שהם סומכים על המלצות של מיקרו-משפיענים יותר מאשר על פרסומות ממומנות רגילות.',
  'שילוב תוכן גולשים (UGC) בתוך קמפיינים ממומנים (Paid Social) מוריד את עלות ההמרה (CPA) בעד 50%.',
  'הצעת מחיר מנצחת מתחילה בתובנה (Insight) חדה - כזו שמחברת בין הכאב של הקהל לפתרון של המותג.',
  'סוד מקצועי: משפיעני Nano (1K-10K עוקבים) מציגים את אחוזי המעורבות (Engagement) הגבוהים ביותר ברשת.',
  'מסמכים והצעות מחיר שכוללים ויזואליה מותאמת אישית נסגרים ב-34% יותר מהר לעומת הצעות טקסטואליות.',
  'CPE (עלות למעורבות) ממוצע בקמפיין משפיענים איכותי בישראל נע לרוב בין 1.5 ל-3.5 שקלים, תלוי בנישה.',
  'טיקטוק או אינסטגרם? בטיקטוק החשיפה האורגנית גבוהה פי 4, אך באינסטגרם אחוזי ההמרה לרכישה עדיין מובילים.',
  'קמפיינים ארוכי טווח (שגרירי מותג) מייצרים פי 2 יותר זכירות מותג מאשר קמפיינים נקודתיים (One-offs).',
  'כדי לייצר קריאייטיב שובר רשת, תנו למשפיענים חופש פעולה ב-80% מהתוכן, ושמרו 20% למסרי חובה של המותג.',
  '67% מאנשי השיווק מדווחים שהאיכות של קהל שמגיע דרך משפיענים גבוהה יותר מקהל שמגיע מפרסום רגיל.',
  'הטעות הכי נפוצה היא לבחור משפיענים רק לפי כמות עוקבים, ולא לפי אמינות והתאמה לערכי המותג.',
]

export default function ResearchPage() {
  const params = useParams()
  const router = useRouter()
  const documentId = params.id as string

  const [stage, setStage] = useState<ResearchStage>('loading')
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [brandName, setBrandName] = useState('')
  const [brandIndustry, setBrandIndustry] = useState('')
  const [budgetAmount, setBudgetAmount] = useState(0)
  const [budgetCurrency, setBudgetCurrency] = useState('₪')
  const [brandDone, setBrandDone] = useState(false)
  const [influencerDone, setInfluencerDone] = useState(false)
  const [subStageMsg, setSubStageMsg] = useState('')
  // Per-agent progress
  const [agentStatuses, setAgentStatuses] = useState<Array<'pending' | 'running' | 'done' | 'failed'>>([])
  const [synthesizing, setSynthesizing] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [researchResults, setResearchResults] = useState<{ brand: any; influencer: any; colors: any; logoUrl?: string | null } | null>(null)
  const [showResults, setShowResults] = useState(false)
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [building, setBuilding] = useState(false)

  // Research status per section — for transparency + retry
  const [brandStatus, setBrandStatus] = useState<'success' | 'failed' | null>(null)
  const [influencerStatus, setInfluencerStatus] = useState<'success' | 'failed' | null>(null)
  const [retryingBrand, setRetryingBrand] = useState(false)
  const [retryingInfluencer, setRetryingInfluencer] = useState(false)

  // Store raw data for enrichment step (needed for buildProposal)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [existingStepDataRef, setExistingStepDataRef] = useState<Record<string, any>>({})
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [extractedRef, setExtractedRef] = useState<Record<string, any>>({})
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pipelineStatusRef, setPipelineStatusRef] = useState<Record<string, any>>({})

  const startedRef = useRef(false)
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Tips rotation
  const [tipIndex, setTipIndex] = useState(0)
  const [tipVisible, setTipVisible] = useState(true)

  // Elapsed timer
  useEffect(() => {
    if (stage !== 'done' && stage !== 'error' && stage !== 'loading' && stage !== 'reviewing') {
      setElapsed(0)
      elapsedRef.current = setInterval(() => setElapsed(prev => prev + 1), 1000)
    } else if (elapsedRef.current) {
      clearInterval(elapsedRef.current)
    }
    return () => { if (elapsedRef.current) clearInterval(elapsedRef.current) }
  }, [stage])

  // Sub-stage message rotation (influencer only)
  useEffect(() => {
    if (stage !== 'brand_research' && stage !== 'influencer_research') return
    const stages = INFLUENCER_STAGES
    let idx = 0
    setSubStageMsg(stages[0])
    const interval = setInterval(() => {
      idx = (idx + 1) % stages.length
      setSubStageMsg(stages[idx])
    }, 8000)
    return () => clearInterval(interval)
  }, [stage])

  // Tips rotation
  useEffect(() => {
    if (stage === 'loading' || stage === 'error' || stage === 'done' || stage === 'reviewing') return
    const interval = setInterval(() => {
      setTipVisible(false)
      setTimeout(() => {
        setTipIndex(prev => (prev + 1) % GENERIC_TIPS.length)
        setTipVisible(true)
      }, 500)
    }, 7000)
    return () => clearInterval(interval)
  }, [stage])

  const runResearch = useCallback(async () => {
    if (startedRef.current) return
    startedRef.current = true
    setError(null)

    try {
      // Stage 1: Load document
      setStage('loading')
      const docRes = await fetch(`/api/documents/${documentId}`)
      if (!docRes.ok) throw new Error('Failed to load document')
      const docData = await docRes.json()
      const data = docData.document?.data || docData.data || {}
      const pipelineStatus = data._pipelineStatus || {}

      // Skip if already done
      if (pipelineStatus.research === 'complete') {
        router.push(`/wizard/${documentId}`)
        return
      }

      const name = data.brandName || data._extractedData?.brand?.name || ''
      setBrandName(name)
      setBrandIndustry(data._extractedData?.brand?.industry || '')
      if (data._extractedData?.budget?.amount) {
        setBudgetAmount(data._extractedData.budget.amount)
        setBudgetCurrency(data._extractedData.budget.currency || '₪')
      }

      // No brand name → skip to wizard
      if (!name) {
        console.log('[Research] No brand name, skipping to wizard')
        router.push(`/wizard/${documentId}`)
        return
      }

      // Save for buildProposal later
      const extracted = data._extractedData || {}
      setExistingStepDataRef(data._stepData || {})
      setExtractedRef(extracted)
      setPipelineStatusRef(pipelineStatus)

      // Stage 2-3: Run research — client orchestrated for Vercel safety
      setStage('brand_research')
      setBrandDone(false)
      setInfluencerDone(false)
      setSynthesizing(false)
      setAgentStatuses(Array(AGENT_COUNT).fill('running'))

      const brand = extracted.brand || {}
      const targetAudience = extracted.targetAudience || {}

      // Fire 4 research agents in parallel (was 7 — reduced to avoid Gemini rate limits)
      const agentPromises = Array.from({ length: AGENT_COUNT }, (_, i) =>
        fetch('/api/research/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brandName: name, angleIndex: i }),
        })
          .then(async res => {
            const data = res.ok ? await res.json() : { angle: AGENT_LABELS[i], data: 'שגיאה' }
            setAgentStatuses(prev => { const next = [...prev]; next[i] = res.ok ? 'done' : 'failed'; return next })
            return data
          })
          .catch(() => {
            setAgentStatuses(prev => { const next = [...prev]; next[i] = 'failed'; return next })
            return { angle: AGENT_LABELS[i], data: 'שגיאה באיסוף מידע.' }
          })
      )

      // Wait for all 4 agents
      const gatheredData = await Promise.all(agentPromises)

      // Synthesize — separate Lambda call
      setSynthesizing(true)
      const synthesizePromise = fetch('/api/research/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandName: name, gatheredData }),
      }).then(async res => {
        setSynthesizing(false)
        setBrandDone(true)
        if (!res.ok) throw new Error('Synthesis failed')
        return res.json()
      })

      // Wait for brand synthesis — with 2-min safety timeout so influencer can start even if synthesis hangs
      console.log('[Research] Waiting for brand synthesis...')
      const synthesisTimeout = new Promise<{ status: 'rejected'; reason: Error }>((resolve) =>
        setTimeout(() => resolve({ status: 'rejected' as const, reason: new Error('Synthesis timeout (2min)') }), 120_000)
      )
      const brandResult = await Promise.allSettled([
        Promise.race([synthesizePromise, synthesisTimeout.then(() => { throw new Error('Synthesis timeout') })])
      ])
      console.log('[Research] Brand synthesis settled:', brandResult[0].status)

      // THEN run influencer research (sequential — avoids overloading Gemini API)
      setStage('influencer_research')
      console.log('[Research] Starting influencer research...')
      const influencerResult = await Promise.allSettled([
        fetch('/api/influencers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'discover',
            brandResearch: {
              brandName: name,
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
        }).then(async res => {
          setInfluencerDone(true)
          console.log(`[Research] Influencer API returned: ${res.status}`)
          if (!res.ok) throw new Error('Influencer research failed')
          return res.json()
        })
      ])
      console.log('[Research] Influencer research settled:', influencerResult[0].status)

      const brandSettled = brandResult[0]
      const influencerSettled = influencerResult[0]

      const brandResearch = brandSettled.status === 'fulfilled' ? brandSettled.value.research : null
      const colors = brandSettled.status === 'fulfilled' ? brandSettled.value.colors : null
      const logoUrl = brandSettled.status === 'fulfilled' ? (brandSettled.value.logoUrl as string | null) : null
      const influencerStrategy = influencerSettled.status === 'fulfilled'
        ? (influencerSettled.value.strategy || influencerSettled.value)
        : null

      if (!brandResearch && !influencerStrategy) {
        throw new Error('שני המחקרים נכשלו. נסה שוב.')
      }

      // Set status for each research section
      setBrandStatus(brandSettled.status === 'fulfilled' ? 'success' : 'failed')
      setInfluencerStatus(influencerSettled.status === 'fulfilled' ? 'success' : 'failed')

      // Save results for display — but DO NOT enrich yet (user must approve first)
      setResearchResults({ brand: brandResearch, influencer: influencerStrategy, colors, logoUrl })
      setStage('reviewing')
      setShowResults(true)
    } catch (err) {
      console.error('[Research] Error:', err)
      setStage('error')
      setError(err instanceof Error ? err.message : 'שגיאה במחקר')
      startedRef.current = false
    }
  }, [documentId, router])

  // Auto-start on mount
  useEffect(() => {
    runResearch()
  }, [runResearch])

  // Retry brand research only
  const retryBrandResearch = useCallback(async () => {
    if (retryingBrand) return
    setRetryingBrand(true)
    try {
      const res = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandName }),
      })
      if (!res.ok) throw new Error('Brand research failed')
      const result = await res.json()
      setBrandStatus('success')
      setResearchResults(prev => prev
        ? { ...prev, brand: result.research, colors: result.colors, logoUrl: result.logoUrl ?? prev.logoUrl }
        : { brand: result.research, influencer: null, colors: result.colors, logoUrl: result.logoUrl ?? null }
      )
    } catch {
      // status remains 'failed'
    } finally {
      setRetryingBrand(false)
    }
  }, [brandName, retryingBrand])

  // Retry influencer research only
  const retryInfluencerResearch = useCallback(async () => {
    if (retryingInfluencer) return
    setRetryingInfluencer(true)
    try {
      const brand = extractedRef.brand || {}
      const targetAudience = extractedRef.targetAudience || {}
      const res = await fetch('/api/influencers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'discover',
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
          budget: extractedRef.budget?.amount || 0,
          goals: extractedRef.campaignGoals || [],
        }),
      })
      if (!res.ok) throw new Error('Influencer research failed')
      const result = await res.json()
      setInfluencerStatus('success')
      setResearchResults(prev => prev
        ? { ...prev, influencer: result.strategy || result }
        : { brand: null, influencer: result.strategy || result, colors: null }
      )
    } catch {
      // status remains 'failed'
    } finally {
      setRetryingInfluencer(false)
    }
  }, [brandName, extractedRef, retryingInfluencer])

  /**
   * buildProposal — called only after user confirms.
   * Runs enrichStepData + creative enhancement, saves, navigates to wizard.
   */
  const buildProposal = useCallback(async () => {
    if (building || !researchResults) return
    setBuilding(true)

    try {
      const brandResearch = researchResults.brand
      const influencerStrategy = researchResults.influencer
      const colors = researchResults.colors

      // Call build-proposal: generates full wizard content from docs + research together
      let enriched = existingStepDataRef
      try {
        const buildRes = await fetch('/api/build-proposal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ documentId, brandResearch, influencerStrategy }),
        })
        if (buildRes.ok) {
          const buildData = await buildRes.json()
          if (buildData.stepData) {
            enriched = buildData.stepData
            console.log('[Research] build-proposal succeeded with research data')
          }
        } else {
          console.warn('[Research] build-proposal failed, falling back to enrichStepData')
          enriched = enrichStepData(existingStepDataRef, brandResearch, influencerStrategy)
        }
      } catch (buildErr) {
        console.warn('[Research] build-proposal error, falling back:', buildErr)
        enriched = enrichStepData(existingStepDataRef, brandResearch, influencerStrategy)
      }

      // Attach research data for wizard
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(enriched as any).research = {
        brandResearch: brandResearch || null,
        influencerStrategy: influencerStrategy || null,
        brandColors: colors || null,
      }

      const logoUrl = researchResults.logoUrl ?? null

      // Save everything to document
      const patchPayload: Record<string, unknown> = {
        _pipelineStatus: { ...pipelineStatusRef, research: 'complete' },
        _stepData: enriched,
      }
      if (brandResearch) patchPayload._brandResearch = brandResearch
      if (influencerStrategy) patchPayload._influencerStrategy = influencerStrategy
      if (colors) patchPayload._brandColors = colors
      // Save logoUrl in _scraped.logoUrl format — used by slide-designer + export routes
      if (logoUrl) {
        patchPayload._scraped = { logoUrl }
        patchPayload._brandLogoUrl = logoUrl
      }

      const patchRes = await fetch(`/api/documents/${documentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchPayload),
      })

      if (!patchRes.ok) {
        console.error('[Research] Failed to save research data')
      }

      setStage('done')
      router.push(`/wizard/${documentId}`)
    } catch (err) {
      console.error('[Research] buildProposal error:', err)
      setBuilding(false)
    }
  }, [building, researchResults, existingStepDataRef, pipelineStatusRef, documentId, router])

  // Download research as styled PDF
  const downloadResearch = useCallback(async () => {
    if (!researchResults) return
    setDownloadingPdf(true)
    try {
      const res = await fetch('/api/research-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandName,
          brandResearch: researchResults.brand,
          influencerStrategy: researchResults.influencer,
          brandColors: researchResults.colors,
          skipDriveUpload: true,
        }),
      })
      const result = await res.json()
      if (result.supabaseUrl) {
        const pdfRes = await fetch(result.supabaseUrl)
        const blob = await pdfRes.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `research-${brandName || 'report'}-${new Date().toISOString().slice(0, 10)}.pdf`
        a.style.display = 'none'
        document.body.appendChild(a)
        a.click()
        // Delay cleanup so the browser can start the download
        setTimeout(() => {
          document.body.removeChild(a)
          URL.revokeObjectURL(url)
        }, 200)
      } else {
        console.error('[Research] PDF generation failed:', result.error)
      }
    } catch (err) {
      console.error('[Research] PDF download failed:', err)
    } finally {
      setDownloadingPdf(false)
    }
  }, [researchResults, brandName])

  const activeTips = useMemo(() => GENERIC_TIPS, [])
  const stageStr: string = stage
  const isProcessing = stageStr !== 'error' && stageStr !== 'reviewing' && stageStr !== 'done'

  // Step status helper
  const getStepStatus = useCallback((stepKey: string): 'pending' | 'active' | 'done' => {
    const order = ['loading', 'brand_research', 'influencer_research', 'reviewing']
    const stepIdx = order.indexOf(stepKey)
    const currentIdx = order.indexOf(stageStr)
    if (stageStr === 'done' || stageStr === 'building') return 'done'
    if (stageStr === 'error') return stepIdx <= 0 ? 'done' : 'pending'
    if (currentIdx > stepIdx) return 'done'
    if (currentIdx === stepIdx) return 'active'
    return 'pending'
  }, [stageStr])

  const canBuild = !!(researchResults?.brand || researchResults?.influencer)

  return (
    <div dir="rtl" className="min-h-screen bg-[#f4f5f7] font-sans selection:bg-[#f2cc0d] selection:text-[#212529]">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-[#dfdfdf] bg-white/80 backdrop-blur-md">
        <div className="flex items-center justify-between px-6 py-4 max-w-[1200px] mx-auto">
          <div className="flex items-center gap-3">
            <Image src="/logoblack.png" alt="Leaders" width={120} height={36} className="h-8 w-auto hover:opacity-80 transition-opacity" />
          </div>
          <div className="hidden sm:block">
            <FlowStepper currentStep="research" compact />
          </div>
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 bg-white border border-[#dfdfdf] text-[#6b7281] rounded-full px-5 py-2 text-sm font-medium hover:bg-gray-50 hover:text-[#212529] hover:shadow-sm transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            ביטול
          </button>
        </div>
      </header>

      <div className="max-w-[1000px] mx-auto px-4 md:px-6 py-10">
        {isProcessing && (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-700">
            {/* Hero Card */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0f172a] via-[#1e1b4b] to-[#020617] text-white p-8 md:p-10 shadow-2xl border border-white/10">
              {/* Decorative rings */}
              <svg className="absolute top-0 left-0 w-full h-full opacity-20 pointer-events-none" viewBox="0 0 800 500" fill="none">
                <circle cx="650" cy="250" r="120" stroke="url(#rg1)" strokeWidth="2" className="animate-[spin_20s_linear_infinite] origin-[650px_250px]" strokeDasharray="10 20" />
                <circle cx="650" cy="250" r="200" stroke="#f2cc0d" strokeWidth="1" opacity="0.3" />
                <circle cx="150" cy="400" r="100" stroke="url(#rg2)" strokeWidth="1.5" className="animate-[spin_15s_linear_infinite_reverse] origin-[150px_400px]" strokeDasharray="30 10" />
                <defs>
                  <linearGradient id="rg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#f2cc0d" /><stop offset="100%" stopColor="transparent" /></linearGradient>
                  <linearGradient id="rg2" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#3b82f6" /><stop offset="100%" stopColor="transparent" /></linearGradient>
                </defs>
              </svg>

              <div className="relative z-10">
                {/* Header row */}
                <div className="flex items-start justify-between mb-10">
                  <div className="flex items-center gap-5">
                    <div className="bg-white/10 p-3 rounded-2xl backdrop-blur-md border border-white/10 shadow-[0_0_20px_rgba(255,255,255,0.1)]">
                      <Image src="/logoblack.png" alt="Leaders" width={100} height={30} className="h-6 w-auto brightness-0 invert" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-extrabold tracking-tight">
                        {stageStr === 'error' ? 'שגיאה במחקר' : 'חוקרים את המותג והשוק...'}
                      </h2>
                      <p className="text-[#94a3b8] text-sm mt-1 font-medium">
                        {stageStr === 'loading' && 'טוען נתוני המסמך...'}
                        {stageStr === 'brand_research' && (synthesizing ? 'מסנתז תוצאות...' : `${agentStatuses.filter(s => s === 'done').length}/${AGENT_COUNT} סוכני מחקר הושלמו`)}
                        {stageStr === 'influencer_research' && subStageMsg}
                        {stageStr === 'building' && 'בונה את תוכן ההצעה...'}
                        {stageStr === 'error' && error}
                      </p>
                    </div>
                  </div>
                  {stageStr !== 'error' && (
                    <div className="text-left shrink-0 bg-black/30 backdrop-blur-sm px-4 py-2 rounded-xl border border-white/5">
                      <div className="text-3xl font-mono font-bold tabular-nums text-[#f2cc0d] drop-shadow-[0_0_8px_rgba(242,204,13,0.5)]">
                        {Math.floor(elapsed / 60).toString().padStart(2, '0')}:{(elapsed % 60).toString().padStart(2, '0')}
                      </div>
                      <p className="text-[#94a3b8] text-xs font-semibold tracking-wider text-center mt-1">זמן ריצה</p>
                    </div>
                  )}
                </div>

                {/* Progress Steps */}
                <div className="flex items-center gap-2 mb-10">
                  {RESEARCH_STEPS.map((step, i) => {
                    const status = getStepStatus(step.key)
                    return (
                      <div key={step.key} className="flex items-center gap-2 flex-1">
                        <div className="flex items-center gap-3 shrink-0">
                          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-bold transition-all duration-500 ${
                            status === 'done'
                              ? 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/30 shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                              : status === 'active'
                              ? 'bg-[#f2cc0d] text-[#0f172a] shadow-[0_0_20px_rgba(242,204,13,0.4)] scale-110'
                              : 'bg-white/5 text-white/30 border border-white/5'
                          }`}>
                            {status === 'done' ? (
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            ) : status === 'active' ? (
                              <div className="relative flex items-center justify-center w-full h-full">
                                <div className="absolute inset-0 rounded-2xl border-2 border-[#0f172a] border-t-transparent animate-spin" />
                                <span>{i + 1}</span>
                              </div>
                            ) : (
                              <span>{i + 1}</span>
                            )}
                          </div>
                          <span className={`text-sm font-bold hidden sm:inline tracking-wide ${
                            status === 'done' ? 'text-[#10b981]' :
                            status === 'active' ? 'text-[#f2cc0d]' :
                            'text-white/30'
                          }`}>{step.label}</span>
                        </div>
                        {i < RESEARCH_STEPS.length - 1 && (
                          <div className="flex-1 h-1.5 rounded-full relative overflow-hidden bg-white/5">
                            <div className={`absolute inset-y-0 right-0 transition-all duration-1000 ease-out ${
                              status === 'done'
                                ? 'left-0 bg-gradient-to-l from-[#10b981] to-[#047857]'
                                : 'left-full bg-[#f2cc0d]'
                            }`} />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Research progress tracks */}
                {(stageStr === 'brand_research' || stageStr === 'influencer_research' || stageStr === 'building') && (
                  <div className="space-y-3 mb-8">

                    {/* Brand agents grid */}
                    <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                      <div className="flex items-center gap-2 mb-3">
                        {brandDone ? (
                          <div className="w-6 h-6 rounded-md bg-[#10b981] flex items-center justify-center shrink-0">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          </div>
                        ) : (
                          <div className="w-6 h-6 rounded-md bg-blue-500 flex items-center justify-center shrink-0">
                            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          </div>
                        )}
                        <span className="font-semibold text-sm text-white">מחקר מותג ושוק</span>
                        {!brandDone && agentStatuses.length > 0 && (
                          <span className="text-[#94a3b8] text-xs mr-auto">
                            {synthesizing
                              ? 'מסנתז תוצאות...'
                              : `${agentStatuses.filter(s => s === 'done' || s === 'failed').length}/${AGENT_COUNT} סוכנים השלימו`
                            }
                          </span>
                        )}
                      </div>

                      {/* Per-agent rows */}
                      {agentStatuses.length > 0 && (
                        <div className="grid grid-cols-1 gap-1 mb-2">
                          {AGENT_LABELS.map((label, i) => {
                            const s = agentStatuses[i] || 'pending'
                            const pct = s === 'done' || s === 'failed' ? 100 : s === 'running' ? Math.min(elapsed / 600 * 100, 95) : 0
                            return (
                              <div key={i} className="px-2 py-1.5 rounded-lg bg-white/5">
                                <div className="flex items-center gap-2 mb-1">
                                  <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                                    s === 'done' ? 'bg-[#10b981]' :
                                    s === 'failed' ? 'bg-red-500' :
                                    s === 'running' ? 'bg-blue-500' : 'bg-white/10'
                                  }`}>
                                    {s === 'done' && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                    {s === 'failed' && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>}
                                    {s === 'running' && <div className="w-2 h-2 border border-white border-t-transparent rounded-full animate-spin" />}
                                  </div>
                                  <span className={`text-xs font-medium ${
                                    s === 'done' ? 'text-[#10b981]' :
                                    s === 'failed' ? 'text-red-400' :
                                    s === 'running' ? 'text-white/80' : 'text-white/30'
                                  }`}>{label}</span>
                                  {s === 'running' && (
                                    <span className="text-[10px] text-white/30 mr-auto tabular-nums">
                                      {String(Math.floor(elapsed / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}
                                    </span>
                                  )}
                                </div>
                                <div className="h-0.5 bg-white/5 rounded-full overflow-hidden">
                                  <div
                                    className="h-full rounded-full transition-all duration-1000"
                                    style={{
                                      width: `${pct}%`,
                                      backgroundColor: s === 'done' ? '#10b981' : s === 'failed' ? '#ef4444' : '#3b82f6',
                                    }}
                                  />
                                </div>
                              </div>
                            )
                          })}
                          {/* Synthesis row */}
                          <div className="px-2 py-1.5 rounded-lg bg-white/5 mt-1 border-t border-white/5">
                            <div className="flex items-center gap-2 mb-1">
                              <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                                brandDone ? 'bg-[#10b981]' :
                                synthesizing ? 'bg-[#f2cc0d]' : 'bg-white/10'
                              }`}>
                                {brandDone && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                {synthesizing && <div className="w-2 h-2 border border-[#0f172a] border-t-transparent rounded-full animate-spin" />}
                              </div>
                              <span className={`text-xs font-semibold ${
                                brandDone ? 'text-[#10b981]' :
                                synthesizing ? 'text-[#f2cc0d]' : 'text-white/30'
                              }`}>סינתזה ועיבוד סופי</span>
                              {synthesizing && (
                                <span className="text-[10px] text-white/30 mr-auto tabular-nums">
                                  {String(Math.floor(elapsed / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}
                                </span>
                              )}
                            </div>
                            <div className="h-0.5 bg-white/5 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-1000"
                                style={{
                                  width: brandDone ? '100%' : synthesizing ? `${Math.min(elapsed / 600 * 100, 95)}%` : '0%',
                                  backgroundColor: brandDone ? '#10b981' : '#f2cc0d',
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Influencer research */}
                    <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                      <div className="flex items-center gap-3 mb-3">
                        {influencerDone ? (
                          <div className="w-6 h-6 rounded-md bg-[#10b981] flex items-center justify-center">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          </div>
                        ) : (
                          <div className="w-6 h-6 rounded-md bg-purple-500 flex items-center justify-center">
                            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          </div>
                        )}
                        <div className="flex-1">
                          <div className="font-semibold text-sm text-white">מחקר משפיענים</div>
                          <div className="text-xs text-[#94a3b8]">
                            {influencerDone ? 'הושלם!' : INFLUENCER_STAGES[Math.floor(elapsed / 8) % INFLUENCER_STAGES.length]}
                          </div>
                        </div>
                        {!influencerDone && (
                          <span className="text-[10px] text-white/30 tabular-nums">
                            {String(Math.floor(elapsed / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}
                          </span>
                        )}
                      </div>
                      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-l from-purple-500 to-purple-400 rounded-full transition-all duration-1000"
                          style={{ width: influencerDone ? '100%' : `${Math.min(elapsed / 600 * 100, 95)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Building state — spinner */}
                {stageStr === 'building' && (
                  <div className="bg-[#f2cc0d]/10 border border-[#f2cc0d]/30 rounded-2xl p-6 text-center animate-in zoom-in-95 duration-500">
                    <div className="w-16 h-16 rounded-full bg-[#f2cc0d]/20 mx-auto mb-4 flex items-center justify-center">
                      <div className="w-8 h-8 border-3 border-[#f2cc0d] border-t-transparent rounded-full animate-spin" />
                    </div>
                    <h3 className="text-xl font-extrabold text-white mb-2">בונה את ההצעה...</h3>
                    <p className="text-[#94a3b8] text-sm">משלב נתוני מחקר ובינה מלאכותית לתוכן מקצועי</p>
                  </div>
                )}

                {/* Brand Card */}
                {brandName && stageStr !== 'loading' && (
                  <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6 mb-6 shadow-xl animate-in slide-in-from-top-4 duration-500">
                    <div className="flex items-center gap-5">
                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#f2cc0d] to-[#e0bc00] text-[#0f172a] flex items-center justify-center font-black text-3xl shadow-[0_0_20px_rgba(242,204,13,0.3)] border border-white/20">
                        {brandName.charAt(0)}
                      </div>
                      <div className="flex-1">
                        <p className="text-white/60 text-xs font-bold uppercase tracking-wider mb-1">מותג נחקר</p>
                        <p className="font-extrabold text-2xl text-white tracking-tight">{brandName}</p>
                        {brandIndustry && (
                          <div className="inline-flex items-center mt-2 px-3 py-1 rounded-full bg-white/10 text-white/80 text-xs font-semibold border border-white/5">
                            {brandIndustry}
                          </div>
                        )}
                      </div>
                      {budgetAmount > 0 && (
                        <div className="text-left bg-[#0f172a]/50 rounded-xl px-5 py-3 border border-white/10">
                          <p className="text-[#94a3b8] text-xs font-bold uppercase tracking-wider mb-1">תקציב קמפיין</p>
                          <p className="font-black text-2xl text-[#f2cc0d] drop-shadow-md">{budgetCurrency}{budgetAmount.toLocaleString()}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Error state */}
                {stageStr === 'error' && (
                  <div className="bg-red-500/10 backdrop-blur-md border border-red-500/30 rounded-2xl p-6 text-center animate-in zoom-in-95 duration-500">
                    <div className="w-16 h-16 rounded-full bg-red-500/20 mx-auto mb-4 flex items-center justify-center">
                      <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-extrabold text-white mb-2">שגיאה במחקר</h3>
                    <p className="text-red-300 text-sm mb-6">{error}</p>
                    <div className="flex gap-3 justify-center">
                      <button
                        onClick={() => { startedRef.current = false; runResearch() }}
                        className="bg-[#f2cc0d] text-[#0f172a] font-bold px-6 py-3 rounded-full hover:scale-105 transition-transform shadow-lg"
                      >
                        נסה שוב
                      </button>
                      <button
                        onClick={() => router.push(`/wizard/${documentId}`)}
                        className="bg-white/10 text-white/80 font-medium px-6 py-3 rounded-full hover:bg-white/20 transition-colors border border-white/10"
                      >
                        דלג לעורך
                      </button>
                    </div>
                  </div>
                )}

                {/* Tip Card */}
                {stageStr !== 'done' && stageStr !== 'error' && stageStr !== 'building' && (
                  <div className="bg-black/20 backdrop-blur-sm border border-white/5 rounded-2xl p-6 mt-6">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-inner bg-white/5 text-white/50 border border-white/5">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
                        </svg>
                      </div>
                      <div className="flex-1 min-h-[4rem]">
                        <p className="text-[#94a3b8] text-xs font-bold uppercase tracking-wider mb-2">
                          תובנה מקצועית בזמן ההמתנה
                          <span className="text-white/20 mr-3 text-[10px]">({tipIndex + 1}/{activeTips.length})</span>
                        </p>
                        <p className={`text-white/90 text-base md:text-lg font-medium leading-relaxed transition-all duration-500 ${
                          tipVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
                        }`}>
                          &ldquo;{activeTips[tipIndex % activeTips.length]}&rdquo;
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══ RESEARCH RESULTS ═══ */}
        {showResults && researchResults && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* ── Research Status Panel ── */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-[#212529] text-base">סטטוס המחקר</h3>
              </div>
              <div className="space-y-3">
                {/* Brand research status */}
                <div className="flex items-center justify-between py-2.5 px-4 rounded-xl bg-gray-50 border border-gray-100">
                  <div className="flex items-center gap-3">
                    {brandStatus === 'success' ? (
                      <div className="w-7 h-7 rounded-full bg-[#10b981] flex items-center justify-center shrink-0">
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                        <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </div>
                    )}
                    <span className="text-sm font-semibold text-[#212529]">מחקר מותג ושוק</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      brandStatus === 'success'
                        ? 'bg-[#10b981]/10 text-[#059669]'
                        : 'bg-red-50 text-red-600'
                    }`}>
                      {brandStatus === 'success' ? 'הצליח' : 'נכשל'}
                    </span>
                    {brandStatus === 'failed' && (
                      <button
                        onClick={retryBrandResearch}
                        disabled={retryingBrand}
                        className="flex items-center gap-1.5 text-xs font-bold text-[#6b7281] hover:text-[#212529] bg-white border border-gray-200 rounded-full px-3 py-1.5 transition-all hover:shadow-sm disabled:opacity-50"
                      >
                        {retryingBrand ? (
                          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                        ) : (
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        )}
                        {retryingBrand ? 'מנסה שוב...' : 'נסה שוב'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Influencer research status */}
                <div className="flex items-center justify-between py-2.5 px-4 rounded-xl bg-gray-50 border border-gray-100">
                  <div className="flex items-center gap-3">
                    {influencerStatus === 'success' ? (
                      <div className="w-7 h-7 rounded-full bg-[#10b981] flex items-center justify-center shrink-0">
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                        <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </div>
                    )}
                    <span className="text-sm font-semibold text-[#212529]">מחקר משפיענים</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      influencerStatus === 'success'
                        ? 'bg-[#10b981]/10 text-[#059669]'
                        : 'bg-red-50 text-red-600'
                    }`}>
                      {influencerStatus === 'success' ? 'הצליח' : 'נכשל'}
                    </span>
                    {influencerStatus === 'failed' && (
                      <button
                        onClick={retryInfluencerResearch}
                        disabled={retryingInfluencer}
                        className="flex items-center gap-1.5 text-xs font-bold text-[#6b7281] hover:text-[#212529] bg-white border border-gray-200 rounded-full px-3 py-1.5 transition-all hover:shadow-sm disabled:opacity-50"
                      >
                        {retryingInfluencer ? (
                          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                        ) : (
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        )}
                        {retryingInfluencer ? 'מנסה שוב...' : 'נסה שוב'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Action bar */}
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-extrabold text-[#212529]">תוצאות המחקר</h2>
              <div className="flex gap-3">
                <button
                  onClick={downloadResearch}
                  disabled={downloadingPdf}
                  className="flex items-center gap-2 bg-white border border-[#dfdfdf] text-[#6b7281] rounded-full px-5 py-2.5 text-sm font-medium hover:bg-gray-50 hover:text-[#212529] hover:shadow-sm transition-all disabled:opacity-50"
                >
                  {downloadingPdf ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  )}
                  {downloadingPdf ? 'מייצר PDF...' : 'הורד מחקר (PDF)'}
                </button>
                <button
                  onClick={buildProposal}
                  disabled={building || !canBuild}
                  className="flex items-center gap-2 bg-[#f2cc0d] text-[#0f172a] rounded-full px-6 py-2.5 text-sm font-bold hover:scale-105 transition-transform shadow-md disabled:opacity-60 disabled:scale-100"
                >
                  {building ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                      בונה הצעה...
                    </>
                  ) : (
                    <>
                      אשר ובנה הצעה
                      <svg className="w-4 h-4 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* ── Brand Research ── */}
            {researchResults.brand && (
              <ResearchSection title="מחקר מותג" icon="🏢" defaultOpen>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {researchResults.brand.industry && (
                    <InfoCard label="תעשייה" value={researchResults.brand.industry} />
                  )}
                  {researchResults.brand.marketPosition && (
                    <InfoCard label="מיקום בשוק" value={researchResults.brand.marketPosition} />
                  )}
                  {researchResults.brand.pricePositioning && (
                    <InfoCard label="מיצוב מחיר" value={researchResults.brand.pricePositioning} />
                  )}
                  {researchResults.brand.founded && (
                    <InfoCard label="שנת הקמה" value={researchResults.brand.founded} />
                  )}
                </div>
                {researchResults.brand.companyDescription && (
                  <div className="mt-4">
                    <p className="text-xs font-bold text-[#6b7281] uppercase tracking-wider mb-1">תיאור המותג</p>
                    <p className="text-sm text-[#212529] leading-relaxed whitespace-pre-line">{researchResults.brand.companyDescription}</p>
                  </div>
                )}
                {researchResults.brand.brandPersonality?.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-bold text-[#6b7281] uppercase tracking-wider mb-2">אישיות המותג</p>
                    <div className="flex flex-wrap gap-2">
                      {researchResults.brand.brandPersonality.map((p: string, i: number) => (
                        <span key={i} className="bg-[#f2cc0d]/10 text-[#8a7000] px-3 py-1 rounded-full text-xs font-semibold border border-[#f2cc0d]/20">{p}</span>
                      ))}
                    </div>
                  </div>
                )}
                {researchResults.brand.uniqueSellingPoints?.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-bold text-[#6b7281] uppercase tracking-wider mb-2">יתרונות תחרותיים</p>
                    <ul className="space-y-1">
                      {researchResults.brand.uniqueSellingPoints.map((usp: string, i: number) => (
                        <li key={i} className="text-sm text-[#212529] flex items-start gap-2">
                          <span className="text-[#f2cc0d] mt-1">●</span>{usp}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {researchResults.brand.competitors?.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-bold text-[#6b7281] uppercase tracking-wider mb-2">מתחרים</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {researchResults.brand.competitors.slice(0, 6).map((c: { name: string; description?: string; differentiator?: string }, i: number) => (
                        <div key={i} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                          <p className="font-bold text-sm text-[#212529]">{c.name}</p>
                          {c.differentiator && <p className="text-xs text-[#6b7281] mt-1">{c.differentiator}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </ResearchSection>
            )}

            {/* ── Target Audience ── */}
            {researchResults.brand?.targetDemographics && (
              <ResearchSection title="קהל יעד" icon="👥">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {researchResults.brand.targetDemographics.primaryAudience?.gender && (
                    <InfoCard label="מגדר" value={researchResults.brand.targetDemographics.primaryAudience.gender} />
                  )}
                  {researchResults.brand.targetDemographics.primaryAudience?.ageRange && (
                    <InfoCard label="טווח גילאים" value={researchResults.brand.targetDemographics.primaryAudience.ageRange} />
                  )}
                  {researchResults.brand.targetDemographics.primaryAudience?.socioeconomic && (
                    <InfoCard label="סוציו-אקונומי" value={researchResults.brand.targetDemographics.primaryAudience.socioeconomic} />
                  )}
                  {researchResults.brand.targetDemographics.primaryAudience?.lifestyle && (
                    <InfoCard label="סגנון חיים" value={researchResults.brand.targetDemographics.primaryAudience.lifestyle} />
                  )}
                </div>
                {researchResults.brand.targetDemographics.primaryAudience?.interests?.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-bold text-[#6b7281] uppercase tracking-wider mb-2">תחומי עניין</p>
                    <div className="flex flex-wrap gap-2">
                      {researchResults.brand.targetDemographics.primaryAudience.interests.map((interest: string, i: number) => (
                        <span key={i} className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-semibold border border-blue-100">{typeof interest === 'string' ? interest : JSON.stringify(interest)}</span>
                      ))}
                    </div>
                  </div>
                )}
                {researchResults.brand.targetDemographics.primaryAudience?.painPoints?.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-bold text-[#6b7281] uppercase tracking-wider mb-2">נקודות כאב</p>
                    <ul className="space-y-1">
                      {researchResults.brand.targetDemographics.primaryAudience.painPoints.map((p: string, i: number) => (
                        <li key={i} className="text-sm text-[#212529] flex items-start gap-2">
                          <span className="text-red-400 mt-1">●</span>{typeof p === 'string' ? p : JSON.stringify(p)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </ResearchSection>
            )}

            {/* ── Digital Presence ── */}
            {researchResults.brand?.socialPresence && (
              <ResearchSection title="נוכחות דיגיטלית" icon="📱">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {Object.entries(researchResults.brand.socialPresence).map(([platform, data]) => {
                    if (!data) return null
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const d = data as any
                    return (
                      <div key={platform} className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                        <p className="font-bold text-sm text-[#212529] capitalize mb-2">{platform}</p>
                        {d.handle && <p className="text-xs text-[#6b7281]">{d.handle}</p>}
                        {d.followers && <p className="text-lg font-black text-[#212529] mt-1">{d.followers}</p>}
                        {d.engagement && <p className="text-xs text-[#6b7281]">מעורבות: {d.engagement}</p>}
                        {d.contentStyle && <p className="text-xs text-[#6b7281] mt-1">{d.contentStyle}</p>}
                      </div>
                    )
                  })}
                </div>
              </ResearchSection>
            )}

            {/* ── Influencer Strategy ── */}
            {researchResults.influencer && (
              <ResearchSection title="אסטרטגיית משפיענים" icon="📊" defaultOpen>
                {researchResults.influencer.strategySummary && (
                  <p className="text-sm text-[#212529] leading-relaxed mb-4">{researchResults.influencer.strategySummary}</p>
                )}
                {researchResults.influencer.tiers?.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-bold text-[#6b7281] uppercase tracking-wider mb-2">שכבות משפיענים</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                      {researchResults.influencer.tiers.map((tier: { name: string; description?: string; recommendedCount?: number; budgetAllocation?: string; purpose?: string }, i: number) => (
                        <div key={i} className="bg-purple-50 rounded-xl p-4 border border-purple-100">
                          <p className="font-bold text-sm text-purple-900">{tier.name}</p>
                          {tier.recommendedCount && <p className="text-2xl font-black text-purple-700 mt-1">{tier.recommendedCount}</p>}
                          {tier.budgetAllocation && <p className="text-xs text-purple-600 mt-1">תקציב: {tier.budgetAllocation}</p>}
                          {tier.purpose && <p className="text-xs text-[#6b7281] mt-1">{tier.purpose}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {researchResults.influencer.expectedKPIs?.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-[#6b7281] uppercase tracking-wider mb-2">יעדים צפויים</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {researchResults.influencer.expectedKPIs.map((kpi: { metric: string; target: string; rationale?: string }, i: number) => (
                        <div key={i} className="bg-gray-50 rounded-xl p-3 border border-gray-100 text-center">
                          <p className="text-xs text-[#6b7281]">{kpi.metric}</p>
                          <p className="text-xl font-black text-[#212529] mt-1">{kpi.target}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </ResearchSection>
            )}

            {/* ── Influencer Recommendations ── */}
            {researchResults.influencer?.recommendations?.length > 0 && (
              <ResearchSection title="משפיענים מומלצים" icon="⭐" defaultOpen>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {researchResults.influencer.recommendations.map((rec: { name?: string; handle?: string; category?: string; followers?: string; engagement?: string; whyRelevant?: string; platform?: string; estimatedCost?: string; profilePicUrl?: string }, i: number) => (
                    <div key={i} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-3 mb-3">
                        {rec.profilePicUrl ? (
                          <Image src={rec.profilePicUrl} alt={rec.name || ''} width={48} height={48} className="w-12 h-12 rounded-full object-cover border-2 border-gray-100" />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-white font-bold text-lg">
                            {(rec.name || '?').charAt(0)}
                          </div>
                        )}
                        <div>
                          <p className="font-bold text-sm text-[#212529]">{rec.name}</p>
                          {rec.handle && <p className="text-xs text-[#6b7281]">{rec.handle}</p>}
                        </div>
                      </div>
                      <div className="flex gap-3 mb-3">
                        {rec.followers && (
                          <div className="bg-gray-50 rounded-lg px-3 py-1.5">
                            <p className="text-[10px] text-[#6b7281] uppercase">עוקבים</p>
                            <p className="font-bold text-sm text-[#212529]">{rec.followers}</p>
                          </div>
                        )}
                        {rec.engagement && (
                          <div className="bg-gray-50 rounded-lg px-3 py-1.5">
                            <p className="text-[10px] text-[#6b7281] uppercase">מעורבות</p>
                            <p className="font-bold text-sm text-[#212529]">{rec.engagement}</p>
                          </div>
                        )}
                        {rec.estimatedCost && (
                          <div className="bg-gray-50 rounded-lg px-3 py-1.5">
                            <p className="text-[10px] text-[#6b7281] uppercase">עלות</p>
                            <p className="font-bold text-sm text-[#212529]">{rec.estimatedCost}</p>
                          </div>
                        )}
                      </div>
                      {rec.category && (
                        <span className="inline-block bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full text-xs font-semibold mb-2">{rec.category}</span>
                      )}
                      {rec.whyRelevant && (
                        <p className="text-xs text-[#6b7281] leading-relaxed">{rec.whyRelevant}</p>
                      )}
                    </div>
                  ))}
                </div>
              </ResearchSection>
            )}

            {/* ── Sources ── */}
            {researchResults.brand?.sources?.length > 0 && (
              <ResearchSection title="מקורות" icon="📚">
                <div className="space-y-2">
                  {researchResults.brand.sources.map((src: { title: string; url?: string }, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="text-[#6b7281]">•</span>
                      {src.url ? (
                        <a href={src.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{src.title}</a>
                      ) : (
                        <span className="text-[#212529]">{src.title}</span>
                      )}
                    </div>
                  ))}
                </div>
              </ResearchSection>
            )}

            {/* Bottom action bar */}
            <div className="flex items-center justify-center gap-4 pt-4 pb-8">
              <button
                onClick={downloadResearch}
                disabled={downloadingPdf}
                className="flex items-center gap-2 bg-white border border-[#dfdfdf] text-[#6b7281] rounded-full px-6 py-3 text-sm font-medium hover:bg-gray-50 hover:text-[#212529] hover:shadow-sm transition-all disabled:opacity-50"
              >
                {downloadingPdf ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                )}
                {downloadingPdf ? 'מייצר PDF...' : 'הורד מחקר (PDF)'}
              </button>
              <button
                onClick={buildProposal}
                disabled={building || !canBuild}
                className="flex items-center gap-2 bg-[#f2cc0d] text-[#0f172a] rounded-full px-8 py-3 text-sm font-bold hover:scale-105 transition-transform shadow-lg disabled:opacity-60 disabled:scale-100"
              >
                {building ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    בונה הצעה...
                  </>
                ) : (
                  <>
                    אשר ובנה הצעה
                    <svg className="w-4 h-4 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ═══ Helper Components ═══

function ResearchSection({ title, icon, defaultOpen = false, children }: {
  title: string; icon: string; defaultOpen?: boolean; children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">{icon}</span>
          <h3 className="font-bold text-[#212529] text-base">{title}</h3>
        </div>
        <svg className={`w-5 h-5 text-[#6b7281] transition-transform duration-200 ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-6 pb-5 animate-in fade-in slide-in-from-top-2 duration-300">
          {children}
        </div>
      )}
    </div>
  )
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
      <p className="text-xs font-bold text-[#6b7281] uppercase tracking-wider mb-1">{label}</p>
      <p className="text-sm font-semibold text-[#212529]">{value}</p>
    </div>
  )
}
