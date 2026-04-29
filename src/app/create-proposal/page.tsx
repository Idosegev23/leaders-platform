'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { toast } from 'sonner'
import GoogleDrivePicker from '@/components/google-drive-picker'
import type { UploadedDocument, ExtractedBriefData } from '@/types/brief'

type ProcessingStage = 'idle' | 'parsing' | 'processing' | 'confirming' | 'creating' | 'done' | 'error'

// ---------- Data-Driven Generic Tips (WOW Effect) ----------
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
  'הטעות הכי נפוצה היא לבחור משפיענים רק לפי כמות עוקבים, ולא לפי אמינות והתאמה לערכי המותג.'
]

interface LogEntry {
  id: string
  timestamp: Date
  type: 'info' | 'success' | 'warning' | 'error' | 'detail'
  message: string
}

const ACCEPTED_FILE_TYPES = '.pdf,.docx,.png,.jpg,.jpeg,.webp'
const MAX_FILE_SIZE = 20 * 1024 * 1024

export default function CreateProposalPage() {
  const router = useRouter()
  const briefInputRef = useRef<HTMLInputElement>(null)
  const kickoffInputRef = useRef<HTMLInputElement>(null)
  const logsEndRef = useRef<HTMLDivElement>(null) // For auto-scrolling terminal

  const [briefDoc, setBriefDoc] = useState<UploadedDocument | null>(null)
  const [briefFile, setBriefFile] = useState<File | null>(null)
  const [kickoffDoc, setKickoffDoc] = useState<UploadedDocument | null>(null)
  const [kickoffFile, setKickoffFile] = useState<File | null>(null)
  const [stage, setStage] = useState<ProcessingStage>('idle')
  const [error, setError] = useState<string | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [brandInfo, setBrandInfo] = useState<ExtractedBriefData | null>(null)
  const [brandFacts, setBrandFacts] = useState<string[]>([])

  // Auto scroll logs for that "Terminal" effect
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs])

  const addLog = useCallback((type: LogEntry['type'], message: string) => {
    setLogs(prev => [...prev, {
      id: `${Date.now()}-${Math.random()}`,
      timestamp: new Date(),
      type,
      message,
    }])
  }, [])

  const handleFileSelect = useCallback(
    (file: File, docType: 'client_brief' | 'kickoff') => {
      if (file.size > MAX_FILE_SIZE) {
        setError('הקובץ גדול מדי. מקסימום 20MB.')
        return
      }

      const doc: UploadedDocument = {
        id: `${docType}-${Date.now()}`,
        type: docType,
        format: getFileFormat(file.type),
        status: 'pending',
        fileName: file.name,
      }

      if (docType === 'client_brief') {
        setBriefDoc(doc)
        setBriefFile(file)
      } else {
        setKickoffDoc(doc)
        setKickoffFile(file)
      }
      setError(null)
    },
    []
  )

  const handleDrop = useCallback(
    (e: React.DragEvent, docType: 'client_brief' | 'kickoff') => {
      e.preventDefault()
      const file = e.dataTransfer.files[0]
      if (file) handleFileSelect(file, docType)
    },
    [handleFileSelect]
  )

  const parseFileUpload = async (
    file: File,
    docType: string,
  ): Promise<{ text: string; geminiFileUri?: string; geminiFileMime?: string }> => {
    const MAX_DIRECT_UPLOAD = 4 * 1024 * 1024 // 4MB — Vercel serverless body limit

    if (file.size <= MAX_DIRECT_UPLOAD) {
      // Small file → send directly as FormData
      const formData = new FormData()
      formData.append('file', file)
      formData.append('docType', docType)

      const res = await fetch('/api/parse-document', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to parse document')
      return {
        text: data.parsedText,
        geminiFileUri: data.geminiFileUri,
        geminiFileMime: data.geminiFileMime,
      }
    }

    // Large file → upload to Supabase Storage first, then send URL
    console.log(`[Create Proposal] File too large for direct upload (${(file.size / 1024 / 1024).toFixed(1)}MB), uploading to storage first...`)

    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const storagePath = `documents/briefs/${docType}_${Date.now()}_${sanitizedName}`

    const { error: uploadError } = await supabase.storage
      .from('assets')
      .upload(storagePath, file, { contentType: file.type, upsert: true })

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`)

    const { data: urlData } = supabase.storage.from('assets').getPublicUrl(storagePath)
    const storageUrl = urlData.publicUrl

    // Send the URL to parse-document instead of the file itself
    const res = await fetch('/api/parse-document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storageUrl, fileName: file.name, fileType: file.type, docType }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to parse document')
    return {
      text: data.parsedText,
      geminiFileUri: data.geminiFileUri,
      geminiFileMime: data.geminiFileMime,
    }
  }

  // Fetch dynamic brand facts in background
  const fetchBrandFacts = async (brandName: string) => {
    try {
      const res = await fetch('/api/brand-quick-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandName }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.facts?.length) {
          setBrandFacts(data.facts)
        }
      }
    } catch {
      // Silent fail - will fallback to generic tips
    }
  }

  const handleGenerate = async () => {
    if (!briefDoc) {
      setError('יש להעלות לפחות בריף לקוח')
      return
    }

    setStage('parsing')
    setError(null)
    setLogs([])
    setBrandInfo(null)
    setBrandFacts([])

    try {
      // === STEP 1: Parse Documents ===
      addLog('info', 'מאתחל חיבור למערכות AI מתקדמות...')
      addLog('info', 'מתחיל סריקה ועיבוד מסמכים...')
      let briefText = ''
      let kickoffText = ''
      let geminiFileUri: string | undefined
      let geminiFileMime: string | undefined

      if (briefFile) {
        const formatName = getFormatDisplayName(briefFile.type)
        addLog('info', `קורא בריף לקוח: ${briefDoc.fileName} (${formatName}, ${formatFileSize(briefFile.size)})`)

        const startTime = Date.now()
        const briefResult = await parseFileUpload(briefFile, 'client_brief')
        briefText = briefResult.text
        geminiFileUri = briefResult.geminiFileUri
        geminiFileMime = briefResult.geminiFileMime
        const elapsedMs = ((Date.now() - startTime) / 1000).toFixed(1)

        addLog('success', `בריף לקוח פוענח בהצלחה - ${briefText.length.toLocaleString()} תווים חולצו (${elapsedMs}s)${geminiFileUri ? ' + Gemini Files API' : ''}`)
      }

      if (!briefText) {
        throw new Error('לא הצלחנו לחלץ טקסט מהבריף. נסה לגרור את הקובץ מחדש או לבחור פורמט אחר.')
      }

      if (kickoffDoc && kickoffFile) {
        const formatName = getFormatDisplayName(kickoffFile.type)
        addLog('info', `קורא מסמך התנעה פנימי: ${kickoffDoc.fileName}`)

        try {
          const startTime = Date.now()
          const kickoffResult = await parseFileUpload(kickoffFile, 'kickoff')
          kickoffText = kickoffResult.text
          const elapsedMs = ((Date.now() - startTime) / 1000).toFixed(1)
          addLog('success', `מסמך התנעה פוענח - ${kickoffText.length.toLocaleString()} תווים חולצו (${elapsedMs}s)`)
        } catch (kickoffErr) {
          addLog('warning', `מסמך ההתנעה לא נקרא: ${kickoffErr instanceof Error ? kickoffErr.message : 'שגיאה'}. ממשיכים עם הבריף בלבד.`)
        }
      }

      // === STEP 2: AI Processing ===
      setStage('processing')
      addLog('info', 'סוכן AI אסטרטגי מנתח את הנתונים ומייצר הצעה מלאה...')
      addLog('detail', `מנתח סך הכל ${(briefText.length + kickoffText.length).toLocaleString()} תווים של תוכן עסקי`)

      const processStart = Date.now()
      const processRes = await fetch('/api/process-proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientBriefText: briefText,
          kickoffText: kickoffText || undefined,
          geminiFileUri,
          geminiFileMime,
        }),
      })
      const processData = await processRes.json()
      const processElapsed = ((Date.now() - processStart) / 1000).toFixed(1)

      if (!processRes.ok) {
        if (processRes.status === 503 || processData.isOverloaded) {
          toast.error('שרתי ה-AI עמוסים כרגע', {
            description: 'כל מנועי ה-AI עמוסים. נסה שוב בעוד 2-3 דקות.',
            duration: 12000,
          })
          throw new Error('שרתי ה-AI עמוסים כרגע — נסה שוב בעוד מספר דקות')
        }
        throw new Error(processData.error || 'שגיאה בעיבוד המסמכים')
      }

      // Notify user if engine switched from Gemini to Claude
      if (processData.provider?.provider === 'claude') {
        toast.info('עומס במנוע הראשי — עברנו למנוע חלופי', {
          description: 'זיהינו עומס בשרתי Google Gemini. עברנו אוטומטית למנוע Claude AI. התהליך ממשיך כרגיל.',
          duration: 10000,
        })
        addLog('warning', 'עומס ב-Gemini — המערכת עברה אוטומטית למנוע Claude AI')
      }

      const extracted: ExtractedBriefData = processData.extracted
      setBrandInfo(extracted)

      addLog('success', `מסמכים נותחו (${processElapsed}s) — רמת ביטחון: ${extracted._meta?.confidence?.toUpperCase() || 'N/A'}`)

      if (extracted.brand?.name) {
        addLog('success', `מותג זוהה: ${extracted.brand.name}${extracted.brand.industry ? ` | ${extracted.brand.industry}` : ''}`)
      } else {
        addLog('warning', 'שם המותג לא זוהה בוודאות')
      }
      if (extracted.budget?.amount && extracted.budget.amount > 0) {
        addLog('detail', `תקציב: ${extracted.budget.currency}${extracted.budget.amount.toLocaleString()}`)
      }
      if (extracted._meta?.warnings?.length) {
        extracted._meta.warnings.forEach((w: string) => addLog('warning', w))
      }

      // Trigger background dynamic facts fetching (for tips display)
      if (extracted.brand?.name) {
        fetchBrandFacts(extracted.brand.name)
      }

      // === STEP 2.5: Save refs + show confirmation screen ===
      briefTextRef.current = briefText
      kickoffTextRef.current = kickoffText
      geminiFileUriRef.current = geminiFileUri
      geminiFileMimeRef.current = geminiFileMime
      setStage('confirming')
      addLog('info', 'ממתין לאישור...')
      // The rest continues in confirmAndCreate() called from the confirmation UI
      return
    } catch (err) {
      console.error('[Create Proposal] Error:', err)
      setStage('error')
      const msg = err instanceof Error ? err.message : 'שגיאה לא צפויה'
      setError(msg)
      addLog('error', `תהליך נעצר עקב שגיאה: ${msg}`)
    }
  }

  // Store parsed texts for confirmAndCreate
  const briefTextRef = useRef('')
  const kickoffTextRef = useRef('')
  const geminiFileUriRef = useRef<string | undefined>()
  const geminiFileMimeRef = useRef<string | undefined>()

  const confirmAndCreate = async () => {
    const extracted = brandInfo
    if (!extracted) return

    try {
      // === STEP 3: Create Document ===
      setStage('creating')
      addLog('info', 'שומר מסמך ומעביר למחקר...')

      const docRes = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'deck',
          title: extracted.brand?.name
            ? `מצגת - ${extracted.brand.name}`
            : 'מצגת קריאייטיבית חדשה',
          data: {
            brandName: extracted.brand?.name || '',
            _extractedData: extracted,
            _briefText: briefTextRef.current,
            _kickoffText: kickoffTextRef.current || null,
            _geminiFileUri: geminiFileUriRef.current || null,
            _geminiFileMime: geminiFileMimeRef.current || null,
            _stepData: null, // built by /api/build-proposal after research
            _pipelineStatus: {
              textGeneration: 'pending',
              research: 'pending',
              visualAssets: 'pending',
              slideGeneration: 'pending',
            },
            _wizardState: {
              currentStep: 'brief',
              stepStatuses: {
                brief: 'pending',
                research: 'pending',
                goals: 'pending',
                target_audience: 'pending',
                key_insight: 'pending',
                strategy: 'pending',
                creative: 'pending',
                deliverables: 'pending',
                quantities: 'pending',
                media_targets: 'pending',
                influencers: 'pending',
              },
              lastSavedAt: null,
            },
          },
          status: 'draft',
        }),
      })
      const docData = await docRes.json()

      if (!docRes.ok) throw new Error(docData.error || 'Failed to create document')

      const docId = docData.id || docData.document?.id
      addLog('success', `המסמך מוכן! מעביר ליצירת מצגת (ID: ${docId?.slice(0, 8)}...)`)

      setStage('done')

      // Research agent → wizard → generate (v8 architecture)
      // Agent researches + drafts content → user reviews in wizard → rich slides
      setTimeout(() => {
        router.push(`/research/${docId}`)
      }, 1500)
    } catch (err) {
      console.error('[Create Proposal] Error:', err)
      setStage('error')
      const msg = err instanceof Error ? err.message : 'שגיאה לא צפויה'
      setError(msg)
      addLog('error', `תהליך נעצר עקב שגיאה: ${msg}`)
    }
  }

  // ---------- Tips system logic ----------
  const activeTips = useMemo(() => {
    if (brandFacts.length > 0) return brandFacts
    return GENERIC_TIPS
  }, [brandFacts])

  const isBrandTips = brandFacts.length > 0

  const [tipIndex, setTipIndex] = useState(0)
  const [tipVisible, setTipVisible] = useState(true)

  // Reset tip index when tips source changes
  useEffect(() => {
    setTipIndex(0)
    setTipVisible(true)
  }, [isBrandTips])

  useEffect(() => {
    if (stage === 'idle' || stage === 'error') return
    const interval = setInterval(() => {
      setTipVisible(false)
      setTimeout(() => {
        setTipIndex(prev => (prev + 1) % activeTips.length)
        setTipVisible(true)
      }, 500)
    }, 7000)
    return () => clearInterval(interval)
  }, [stage, activeTips.length])

  // Elapsed timer
  const [elapsed, setElapsed] = useState(0)
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (stage !== 'idle' && stage !== 'error' && stage !== 'done') {
      setElapsed(0)
      elapsedRef.current = setInterval(() => setElapsed(prev => prev + 1), 1000)
    } else if (elapsedRef.current) {
      clearInterval(elapsedRef.current)
    }
    return () => { if (elapsedRef.current) clearInterval(elapsedRef.current) }
  }, [stage])

  const isProcessing = stage !== 'idle' && stage !== 'error' && stage !== 'confirming'

  // ===================== RENDER =====================

  return (
    <div dir="rtl" className="min-h-screen bg-[#f4f5f7] font-sans selection:bg-[#f2cc0d] selection:text-[#212529]">
      {/* ---------- Top Navigation ---------- */}
      <header className="sticky top-0 z-50 w-full border-b border-[#dfdfdf] bg-white/80 backdrop-blur-md">
        <div className="flex items-center justify-between px-6 py-4 max-w-[1200px] mx-auto">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <Image
              src="/logoblack.png"
              alt="Leaders"
              width={120}
              height={36}
              className="h-8 w-auto hover:opacity-80 transition-opacity"
            />
          </div>

          {/* Center: Page title as pill badge */}
          <div className="hidden sm:flex items-center">
            <span className="bg-gradient-to-r from-[#e5f2d6] to-[#d4eabf] text-[#4a7c3f] rounded-full px-6 py-2 text-sm font-bold shadow-sm border border-[#cbe3af]">
              סוכן בניית הצעות מחיר
            </span>
          </div>

          {/* Cancel */}
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
        {/* ---------- Upload State ---------- */}
        {!isProcessing && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Hero Header */}
            <div className="mb-10 text-center md:text-right">
              <h1 className="text-4xl md:text-5xl font-extrabold text-[#212529] tracking-tight mb-4">
                בואו ניצור <span className="text-transparent bg-clip-text bg-gradient-to-l from-[#f2cc0d] to-[#e0bc00]">הצעה מנצחת</span>
              </h1>
              <p className="text-[#6b7281] text-lg max-w-2xl">
                העלו את חומרי הגלם. סוכני ה-AI שלנו ינתחו את הבריף, יחקרו את המותג וייצרו הצעה עסקית, קריאייטיבית ומוכנה להגשה תוך דקות בודדות.
              </p>
            </div>

            {/* Upload Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
              {/* Client Brief Card */}
              <div className="bg-white rounded-3xl p-7 shadow-sm border border-[#dfdfdf]/50 hover:shadow-md transition-all group">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#dbe4f5] to-[#c7d5ef] flex items-center justify-center shadow-inner">
                      <svg className="w-6 h-6 text-[#3b5998]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-[#212529]">בריף לקוח</h3>
                      <p className="text-sm font-medium text-[#e94560]">מסמך חובה</p>
                    </div>
                  </div>
                </div>

                <div
                  className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-300 ${
                    briefDoc
                      ? 'border-[#4a7c3f] bg-gradient-to-b from-[#e5f2d6]/30 to-transparent'
                      : 'border-[#dfdfdf] group-hover:border-[#3b5998] group-hover:bg-[#f4f7fc]'
                  }`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleDrop(e, 'client_brief')}
                >
                  {briefDoc ? (
                    <div className="animate-in zoom-in-95 duration-300">
                      <div className="w-14 h-14 rounded-full bg-[#e5f2d6] mx-auto mb-4 flex items-center justify-center shadow-sm">
                        <svg className="w-7 h-7 text-[#4a7c3f]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <p className="font-bold text-[#212529] text-base mb-1 truncate px-4">{briefDoc.fileName}</p>
                      <button
                        className="text-sm font-medium text-[#6b7281] hover:text-[#e94560] mt-3 transition-colors px-3 py-1 rounded-full hover:bg-red-50"
                        onClick={() => {
                          setBriefDoc(null)
                          setBriefFile(null)
                          if (briefInputRef.current) briefInputRef.current.value = ''
                        }}
                      >
                        הסר קובץ
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div className="w-14 h-14 rounded-full bg-white shadow-sm border border-[#dfdfdf] mx-auto mb-4 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                        <svg className="w-6 h-6 text-[#3b5998]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                        </svg>
                      </div>
                      <p className="text-[#212529] font-medium mb-5">גרירת קובץ לכאן</p>
                      <div className="flex gap-3 justify-center">
                        <button
                          onClick={() => briefInputRef.current?.click()}
                          className="bg-white border border-[#dfdfdf] shadow-sm text-[#212529] rounded-full px-5 py-2.5 text-sm font-semibold hover:bg-gray-50 hover:border-[#3b5998] transition-all"
                        >
                          בחירת קובץ
                        </button>
                        <GoogleDrivePicker
                          onFilePicked={(file) => handleFileSelect(file, 'client_brief')}
                          disabled={isProcessing}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <input
                  ref={briefInputRef}
                  type="file"
                  accept={ACCEPTED_FILE_TYPES}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleFileSelect(file, 'client_brief')
                  }}
                />
              </div>

              {/* Kickoff Document Card */}
              <div className="bg-white rounded-3xl p-7 shadow-sm border border-[#dfdfdf]/50 hover:shadow-md transition-all group">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#fcf4d9] to-[#fae6a0] flex items-center justify-center shadow-inner">
                      <svg className="w-6 h-6 text-[#d4a800]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-[#212529]">מסמך התנעה / ישיבה</h3>
                      <p className="text-sm font-medium text-[#6b7281]">אופציונלי להעשרה</p>
                    </div>
                  </div>
                </div>

                <div
                  className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-300 ${
                    kickoffDoc
                      ? 'border-[#d4a800] bg-gradient-to-b from-[#f2cc0d]/10 to-transparent'
                      : 'border-[#dfdfdf] group-hover:border-[#f2cc0d] group-hover:bg-[#fcf4d9]/40'
                  }`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleDrop(e, 'kickoff')}
                >
                  {kickoffDoc ? (
                    <div className="animate-in zoom-in-95 duration-300">
                      <div className="w-14 h-14 rounded-full bg-[#fcf4d9] mx-auto mb-4 flex items-center justify-center shadow-sm">
                        <svg className="w-7 h-7 text-[#d4a800]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <p className="font-bold text-[#212529] text-base mb-1 truncate px-4">{kickoffDoc.fileName}</p>
                      <button
                        className="text-sm font-medium text-[#6b7281] hover:text-[#e94560] mt-3 transition-colors px-3 py-1 rounded-full hover:bg-red-50"
                        onClick={() => {
                          setKickoffDoc(null)
                          setKickoffFile(null)
                          if (kickoffInputRef.current) kickoffInputRef.current.value = ''
                        }}
                      >
                        הסר קובץ
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div className="w-14 h-14 rounded-full bg-white shadow-sm border border-[#dfdfdf] mx-auto mb-4 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                        <svg className="w-6 h-6 text-[#6b7281]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                        </svg>
                      </div>
                      <p className="text-[#212529] font-medium mb-5">גרירת קובץ לכאן</p>
                      <div className="flex gap-3 justify-center">
                        <button
                          onClick={() => kickoffInputRef.current?.click()}
                          className="bg-white border border-[#dfdfdf] shadow-sm text-[#212529] rounded-full px-5 py-2.5 text-sm font-semibold hover:bg-gray-50 hover:border-[#f2cc0d] transition-all"
                        >
                          בחירת קובץ
                        </button>
                        <GoogleDrivePicker
                          onFilePicked={(file) => handleFileSelect(file, 'kickoff')}
                          disabled={isProcessing}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <input
                  ref={kickoffInputRef}
                  type="file"
                  accept={ACCEPTED_FILE_TYPES}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleFileSelect(file, 'kickoff')
                  }}
                />
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 mb-6 animate-in slide-in-from-top-2">
                <div className="flex items-center gap-2 font-bold mb-1">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  שגיאה
                </div>
                {error}
                {stage === 'error' && (
                  <button
                    className="block mt-2 text-sm font-medium underline hover:text-red-800"
                    onClick={() => { setStage('idle'); setError(null); setLogs([]) }}
                  >
                    נסה שוב
                  </button>
                )}
              </div>
            )}

            {/* Generate Button with Shine Effect */}
            <div className="flex justify-center mt-8">
              <button
                onClick={handleGenerate}
                disabled={!briefDoc}
                className="group relative overflow-hidden flex items-center gap-3 bg-[#f2cc0d] text-[#212529] rounded-full px-12 py-5 text-xl font-extrabold hover:scale-105 transition-all duration-300 shadow-[0_0_20px_rgba(242,204,13,0.3)] hover:shadow-[0_0_35px_rgba(242,204,13,0.5)] disabled:opacity-50 disabled:shadow-none disabled:hover:scale-100 disabled:cursor-not-allowed"
              >
                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent group-hover:animate-[shimmer_1.5s_infinite]" />
                <svg className="w-7 h-7 relative z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                </svg>
                <span className="relative z-10">חולל קסמים וצור הצעה</span>
              </button>
            </div>
          </div>
        )}

        {/* ---------- Processing State (WOW Effect) ---------- */}
        {/* ── Confirmation Screen ── */}
        {stage === 'confirming' && brandInfo && (
          <div dir="rtl" className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
            <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#0f172a] via-[#1e1b4b] to-[#020617] text-white p-8 shadow-2xl">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center text-green-400 text-xl">✓</div>
                <div>
                  <h2 className="text-2xl font-bold">הבריף נקרא בהצלחה</h2>
                  <p className="text-white/50 text-sm">בדוק שהנתונים נכונים לפני שממשיכים</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {/* Brand */}
                <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                  <div className="text-xs text-white/40 mb-1 font-medium">מותג</div>
                  <div className="text-lg font-bold">{brandInfo.brand?.name || '—'}</div>
                  {brandInfo.brand?.industry && <div className="text-sm text-white/50 mt-1">{brandInfo.brand.industry}</div>}
                </div>
                {/* Budget */}
                <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                  <div className="text-xs text-white/40 mb-1 font-medium">תקציב</div>
                  <div className="text-lg font-bold">
                    {brandInfo.budget?.amount && brandInfo.budget.amount > 0
                      ? `${brandInfo.budget.currency || '₪'}${brandInfo.budget.amount.toLocaleString()}`
                      : 'לא צוין בבריף'}
                  </div>
                </div>
              </div>

              {/* Goals */}
              {brandInfo.campaignGoals?.length > 0 && (
                <div className="rounded-xl bg-white/5 border border-white/10 p-4 mb-4">
                  <div className="text-xs text-white/40 mb-2 font-medium">יעדי קמפיין ({brandInfo.campaignGoals.length})</div>
                  <ul className="space-y-1">
                    {brandInfo.campaignGoals.slice(0, 5).map((g: string, i: number) => (
                      <li key={i} className="text-sm text-white/70 flex items-start gap-2">
                        <span className="text-[#e94560] mt-0.5 shrink-0">•</span>
                        <span>{g}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Warnings */}
              {brandInfo._meta?.warnings?.length > 0 && (
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4 mb-4">
                  <div className="text-xs text-amber-400 mb-2 font-medium">שים לב</div>
                  {brandInfo._meta.warnings.map((w: string, i: number) => (
                    <p key={i} className="text-sm text-amber-300/70">{w}</p>
                  ))}
                </div>
              )}

              {/* Confidence */}
              <div className="flex items-center gap-2 mb-6">
                <div className={`w-2 h-2 rounded-full ${brandInfo._meta?.confidence === 'high' ? 'bg-green-400' : brandInfo._meta?.confidence === 'medium' ? 'bg-amber-400' : 'bg-red-400'}`} />
                <span className="text-xs text-white/40">
                  רמת ביטחון: {brandInfo._meta?.confidence === 'high' ? 'גבוהה' : brandInfo._meta?.confidence === 'medium' ? 'בינונית' : 'נמוכה'}
                </span>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={confirmAndCreate}
                  className="flex-1 px-6 py-3 rounded-xl bg-gradient-to-l from-[#e94560] to-[#d63051] text-white font-bold text-lg hover:opacity-90 transition-opacity shadow-lg shadow-[#e94560]/20"
                >
                  הכל נכון, המשך למחקר
                </button>
                <button
                  onClick={() => { setStage('idle'); setBrandInfo(null); setLogs([]) }}
                  className="px-6 py-3 rounded-xl border border-white/15 text-white/60 font-medium hover:bg-white/5 transition-all"
                >
                  תקן ונסה שוב
                </button>
              </div>
            </div>
          </div>
        )}

        {isProcessing && (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-700">
            {/* Processing Hero Card - dark with brand accents & Glassmorphism */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0f172a] via-[#1e1b4b] to-[#020617] text-white p-8 md:p-10 shadow-2xl border border-white/10">
              {/* Decorative Animated SVG rings */}
              <svg className="absolute top-0 left-0 w-full h-full opacity-20 pointer-events-none" viewBox="0 0 800 500" fill="none">
                <circle cx="650" cy="250" r="120" stroke="url(#glowGradient1)" strokeWidth="2" className="animate-[spin_20s_linear_infinite] origin-[650px_250px]" strokeDasharray="10 20" />
                <circle cx="650" cy="250" r="200" stroke="#f2cc0d" strokeWidth="1" opacity="0.3" />
                <circle cx="150" cy="400" r="100" stroke="url(#glowGradient2)" strokeWidth="1.5" className="animate-[spin_15s_linear_infinite_reverse] origin-[150px_400px]" strokeDasharray="30 10" />
                <defs>
                  <linearGradient id="glowGradient1" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#f2cc0d" />
                    <stop offset="100%" stopColor="transparent" />
                  </linearGradient>
                  <linearGradient id="glowGradient2" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#e94560" />
                    <stop offset="100%" stopColor="transparent" />
                  </linearGradient>
                </defs>
              </svg>

              <div className="relative z-10">
                {/* Header row: logo + title + timer */}
                <div className="flex items-start justify-between mb-10">
                  <div className="flex items-center gap-5">
                    <div className="bg-white/10 p-3 rounded-2xl backdrop-blur-md border border-white/10 shadow-[0_0_20px_rgba(255,255,255,0.1)]">
                       <Image
                        src="/logoblack.png"
                        alt="Leaders"
                        width={100}
                        height={30}
                        className="h-6 w-auto brightness-0 invert"
                      />
                    </div>
                    <div>
                      <h2 className="text-2xl font-extrabold tracking-tight">
                        {stage === 'done' ? 'ההצעה פרימיום שלך מוכנה!' : 'מנועי ה-AI בונים את ההצעה...'}
                      </h2>
                      <p className="text-[#94a3b8] text-sm mt-1 font-medium">
                        {stage === 'parsing' && 'מפענח נתונים ומחלץ אינטליגנציה עסקית מהבריף'}
                        {stage === 'processing' && 'אסטרטג ה-AI בונה קונספט, מטרות ויעדי קמפיין'}
                        {stage === 'creating' && 'אורז הכל למסמך אינטראקטיבי ומעוצב'}
                        {stage === 'done' && 'מערכות מוכנות, מנווט לעורך...'}
                      </p>
                    </div>
                  </div>
                  {stage !== 'done' && (
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
                  {[
                    { key: 'parsing', label: 'סריקה' },
                    { key: 'processing', label: 'פיצוח AI' },
                    { key: 'creating', label: 'אריזה' },
                  ].map((step, i) => {
                    const status = getStepStatus(step.key, stage)
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
                        {i < 2 && (
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

                {/* Brand Card - Glassmorphism reveal when brand is identified */}
                {brandInfo?.brand?.name && (
                  <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6 mb-6 shadow-xl animate-in slide-in-from-top-4 duration-500">
                    <div className="flex items-center gap-5">
                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#f2cc0d] to-[#e0bc00] text-[#0f172a] flex items-center justify-center font-black text-3xl shadow-[0_0_20px_rgba(242,204,13,0.3)] border border-white/20">
                        {brandInfo.brand.name.charAt(0)}
                      </div>
                      <div className="flex-1">
                        <p className="text-white/60 text-xs font-bold uppercase tracking-wider mb-1">לקוח מזוהה</p>
                        <p className="font-extrabold text-2xl text-white tracking-tight">{brandInfo.brand.name}</p>
                        {brandInfo.brand.industry && (
                          <div className="inline-flex items-center mt-2 px-3 py-1 rounded-full bg-white/10 text-white/80 text-xs font-semibold border border-white/5">
                            {brandInfo.brand.industry}
                          </div>
                        )}
                      </div>
                      {brandInfo.budget?.amount ? (
                        <div className="text-left bg-[#0f172a]/50 rounded-xl px-5 py-3 border border-white/10">
                          <p className="text-[#94a3b8] text-xs font-bold uppercase tracking-wider mb-1">תקציב קמפיין</p>
                          <p className="font-black text-2xl text-[#f2cc0d] drop-shadow-md">{brandInfo.budget.currency}{brandInfo.budget.amount.toLocaleString()}</p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}

                {/* Dynamic Tip Card */}
                <div className="bg-black/20 backdrop-blur-sm border border-white/5 rounded-2xl p-6 mt-6">
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-inner ${
                      isBrandTips ? 'bg-gradient-to-br from-[#f2cc0d]/30 to-[#f2cc0d]/10 text-[#f2cc0d] border border-[#f2cc0d]/20' : 'bg-white/5 text-white/50 border border-white/5'
                    }`}>
                      {isBrandTips ? (
                        <svg className="w-6 h-6 animate-[pulse_3s_ease-in-out_infinite]" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-h-[4rem]">
                      <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${
                        isBrandTips ? 'text-[#f2cc0d]' : 'text-[#94a3b8]'
                      }`}>
                        {isBrandTips
                          ? `תובנת AI על ${brandInfo?.brand?.name || 'הלקוח'}`
                          : `תובנה מקצועית בזמן ההמתנה`
                        }
                        <span className="text-white/20 mr-3 text-[10px]">
                          ({tipIndex + 1}/{activeTips.length})
                        </span>
                      </p>
                      <p className={`text-white/90 text-base md:text-lg font-medium leading-relaxed transition-all duration-500 ${
                        tipVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
                      }`}>
                        "{activeTips[tipIndex % activeTips.length]}"
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Live Terminal Log */}
            <details className="group" open>
              <summary className="flex items-center gap-2 cursor-pointer text-sm font-bold text-[#6b7281] hover:text-[#212529] transition-colors mb-3 select-none px-2">
                <svg className="w-5 h-5 transition-transform group-open:rotate-90 rtl:rotate-180 rtl:group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
                Terminal Activity ({logs.length})
              </summary>
              <div className="bg-[#0f172a] rounded-2xl border border-[#334155] overflow-hidden shadow-lg">
                {/* Terminal Header */}
                <div className="bg-[#1e293b] px-4 py-2 flex items-center gap-2 border-b border-[#334155]">
                  <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
                  <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
                  <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
                  <span className="ml-4 text-xs font-mono text-[#94a3b8]">ai_agent_core.exe --verbose</span>
                </div>
                {/* Terminal Body */}
                <div className="p-5 max-h-64 overflow-y-auto font-mono text-sm space-y-2 scrollbar-thin scrollbar-thumb-[#334155] scrollbar-track-transparent" dir="ltr">
                  {logs.map((log) => (
                    <div key={log.id} className="flex gap-3 items-start hover:bg-white/5 px-2 py-1 rounded transition-colors">
                      <span className="text-[#64748b] shrink-0 font-semibold">
                        [{log.timestamp.toLocaleTimeString('en-US', { hour12: false })}]
                      </span>
                      <span className={`${getLogColorDark(log.type)} font-bold`}>
                        {getLogIcon(log.type)}
                      </span>
                      <span className={log.type === 'detail' ? 'text-[#94a3b8]' : 'text-[#f8fafc] tracking-wide'}>
                        {log.message}
                      </span>
                    </div>
                  ))}
                  {stage !== 'done' && (
                    <div className="flex gap-3 items-center text-[#10b981] animate-pulse px-2 py-1">
                      <span className="font-bold">&gt;</span>
                      <span className="opacity-80">awaiting system response...</span>
                      <div className="w-2 h-4 bg-[#10b981] animate-[ping_1s_infinite]"></div>
                    </div>
                  )}
                  {/* Invisible div to scroll to */}
                  <div ref={logsEndRef} />
                </div>
              </div>
            </details>
          </div>
        )}

        {/* Error during processing */}
        {stage === 'error' && error && (
          <div className="bg-red-50 border-2 border-red-200 text-red-800 rounded-2xl p-6 mt-6 shadow-sm animate-in slide-in-from-top-4">
            <div className="flex items-center gap-3 font-bold text-lg mb-2 text-red-600">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              שגיאת מערכת
            </div>
            <p className="font-medium text-red-700 ml-9">{error}</p>
            <button
              className="mt-4 ml-9 bg-red-100 hover:bg-red-200 text-red-800 font-bold py-2 px-5 rounded-full transition-colors"
              onClick={() => { setStage('idle'); setError(null); setLogs([]) }}
            >
              התחל מחדש
            </button>
          </div>
        )}
      </div>
      
      {/* Add CSS animation for Shimmer effect on button */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes shimmer {
          100% {
            transform: translateX(100%);
          }
        }
      `}} />

    </div>
  )
}

// === Helper Functions ===

function getStepStatus(step: string, currentStage: ProcessingStage): 'pending' | 'active' | 'done' {
  const order = ['parsing', 'processing', 'confirming', 'creating', 'done']
  const stepIdx = order.indexOf(step)
  const currentIdx = order.indexOf(currentStage)
  if (currentIdx > stepIdx) return 'done'
  if (currentIdx === stepIdx) return 'active'
  return 'pending'
}

function getLogColorDark(type: LogEntry['type']): string {
  switch (type) {
    case 'success': return 'text-[#10b981]' // Green
    case 'warning': return 'text-[#f59e0b]' // Yellow
    case 'error': return 'text-[#ef4444]' // Red
    case 'detail': return 'text-[#94a3b8]' // Gray
    default: return 'text-[#38bdf8]' // Blue
  }
}

function getLogIcon(type: LogEntry['type']): string {
  switch (type) {
    case 'success': return 'SUCCESS'
    case 'warning': return 'WARN'
    case 'error': return 'ERROR'
    case 'detail': return 'INFO'
    default: return 'EXEC'
  }
}

function getFileFormat(mimeType: string): UploadedDocument['format'] {
  if (mimeType === 'application/pdf') return 'pdf'
  if (mimeType.includes('wordprocessingml')) return 'docx'
  if (mimeType.startsWith('image/')) return 'image'
  return 'pdf'
}

function getFormatDisplayName(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'PDF'
  if (mimeType.includes('wordprocessingml')) return 'Word'
  if (mimeType.startsWith('image/')) return 'תמונה'
  return 'קובץ'
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}