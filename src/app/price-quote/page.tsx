'use client'

import { useState, useCallback, useRef } from 'react'
import { PRICE_QUOTE_SERVICES } from '@/lib/constants/price-quote-services'
import type { PriceQuoteData, BudgetItem, ContentMixItem } from '@/types/price-quote'
import { SendForSignatureDialog } from '@/components/price-quote/SendForSignatureDialog'

// ─── Default state ───
const defaultBudgetItems: BudgetItem[] = [
  { service: 'משפיענים', detail: '', price: '' },
  { service: 'יוצרי תוכן UGC', detail: '', price: '' },
]

const defaultContentMix: ContentMixItem[] = [
  { detail: '', monthlyPerInfluencer: '', total: '' },
]

const defaultData: PriceQuoteData = {
  clientName: '',
  campaignName: '',
  date: new Date().toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: '2-digit' }),
  contactName: '',
  selectedServiceIds: PRICE_QUOTE_SERVICES.filter(s => s.defaultSelected).map(s => s.id),
  budgetItems: defaultBudgetItems,
  totalBudget: '',
  contentMix: defaultContentMix,
  kpi: { cpv: '', estimatedImpressions: '' },
  platform: 'אינסטגרם / טיקטוק',
  contractPeriod: '',
  additionalNotes: [],
}

export default function PriceQuotePage() {
  const [data, setData] = useState<PriceQuoteData>(defaultData)
  const [previewPage, setPreviewPage] = useState(1)
  const [isGenerating, setIsGenerating] = useState(false)
  const [previewKey, setPreviewKey] = useState(0)
  const [signDialogOpen, setSignDialogOpen] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // ─── Generic field updater ───
  const updateField = useCallback(<K extends keyof PriceQuoteData>(key: K, value: PriceQuoteData[K]) => {
    setData(prev => ({ ...prev, [key]: value }))
  }, [])

  // ─── Service toggle ───
  const toggleService = useCallback((serviceId: string) => {
    setData(prev => ({
      ...prev,
      selectedServiceIds: prev.selectedServiceIds.includes(serviceId)
        ? prev.selectedServiceIds.filter(id => id !== serviceId)
        : [...prev.selectedServiceIds, serviceId],
    }))
  }, [])

  // ─── Budget items ───
  const updateBudgetItem = useCallback((index: number, field: keyof BudgetItem, value: string) => {
    setData(prev => {
      const items = [...prev.budgetItems]
      items[index] = { ...items[index], [field]: value }
      return { ...prev, budgetItems: items }
    })
  }, [])

  const addBudgetItem = useCallback(() => {
    setData(prev => ({
      ...prev,
      budgetItems: [...prev.budgetItems, { service: '', detail: '', price: '' }],
    }))
  }, [])

  const removeBudgetItem = useCallback((index: number) => {
    setData(prev => ({
      ...prev,
      budgetItems: prev.budgetItems.filter((_, i) => i !== index),
    }))
  }, [])

  // ─── Content mix items ───
  const updateContentMix = useCallback((index: number, field: keyof ContentMixItem, value: string) => {
    setData(prev => {
      const items = [...prev.contentMix]
      items[index] = { ...items[index], [field]: value }
      return { ...prev, contentMix: items }
    })
  }, [])

  const addContentMix = useCallback(() => {
    setData(prev => ({
      ...prev,
      contentMix: [...prev.contentMix, { detail: '', monthlyPerInfluencer: '', total: '' }],
    }))
  }, [])

  const removeContentMix = useCallback((index: number) => {
    setData(prev => ({
      ...prev,
      contentMix: prev.contentMix.filter((_, i) => i !== index),
    }))
  }, [])

  // ─── Additional notes ───
  const addNote = useCallback(() => {
    setData(prev => ({ ...prev, additionalNotes: [...prev.additionalNotes, ''] }))
  }, [])

  const updateNote = useCallback((index: number, value: string) => {
    setData(prev => {
      const notes = [...prev.additionalNotes]
      notes[index] = value
      return { ...prev, additionalNotes: notes }
    })
  }, [])

  const removeNote = useCallback((index: number) => {
    setData(prev => ({
      ...prev,
      additionalNotes: prev.additionalNotes.filter((_, i) => i !== index),
    }))
  }, [])

  // ─── Preview ───
  const refreshPreview = useCallback(() => {
    setPreviewKey(k => k + 1)
  }, [])

  const previewUrl = `/api/price-quote?page=${previewPage}&data=${encodeURIComponent(JSON.stringify(data))}`

  // ─── PDF as base64 (used for the signature flow upload) ───
  const generatePdfBase64 = useCallback(async (): Promise<string> => {
    const res = await fetch('/api/price-quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || `PDF generation failed: HTTP ${res.status}`)
    }
    const blob = await res.blob()
    const buf = await blob.arrayBuffer()
    const bytes = new Uint8Array(buf)
    let binary = ''
    const chunk = 0x8000
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)))
    }
    return btoa(binary)
  }, [data])

  // ─── Generate PDF ───
  const generatePdf = useCallback(async () => {
    setIsGenerating(true)
    try {
      const res = await fetch('/api/price-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const err = await res.json()
        alert(`שגיאה: ${err.error}`)
        return
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `הצעת_מחיר_${data.clientName}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('PDF generation failed:', err)
      alert('שגיאה ביצירת PDF')
    } finally {
      setIsGenerating(false)
    }
  }, [data])

  return (
    <div dir="rtl" className="min-h-screen bg-gray-50">
      <SendForSignatureDialog
        open={signDialogOpen}
        onClose={() => setSignDialogOpen(false)}
        defaultTitle={`הצעת מחיר · ${data.clientName || ''}${data.campaignName ? ' · ' + data.campaignName : ''}`.trim()}
        generatePdfBase64={generatePdfBase64}
      />
      {/* Top bar */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <a href="/dashboard" className="text-sm text-gray-500 hover:text-gray-800 transition-colors">
            ← חזרה לדשבורד
          </a>
          <div className="h-4 w-px bg-gray-300" />
          <h1 className="text-xl font-bold text-gray-800">הצעת מחיר</h1>
        </div>
        <div className="flex gap-3">
          <button
            onClick={refreshPreview}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition text-sm font-medium"
          >
            רענן תצוגה
          </button>
          <button
            onClick={generatePdf}
            disabled={isGenerating || !data.clientName}
            className="px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition text-sm font-bold disabled:opacity-50"
          >
            {isGenerating ? 'מייצר PDF...' : 'הורד PDF'}
          </button>
          <button
            onClick={() => {
              if (!data.clientName) { alert('יש למלא שם לקוח'); return }
              setSignDialogOpen(true)
            }}
            disabled={!data.clientName}
            className="px-5 py-2 bg-[#1a1a2e] text-white rounded-lg hover:bg-[#e94560] transition text-sm font-bold disabled:opacity-50"
          >
            ✍︎ שלח לחתימה
          </button>
          <button
            onClick={async () => {
              if (!data.clientName) { alert('יש למלא שם לקוח'); return }
              try {
                const res = await fetch('/api/follow-up', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ brandName: data.clientName, proposalType: 'quote', businessDays: 3 }),
                })
                const result = await res.json()
                if (res.ok && result.success) {
                  alert(`תזכורת פולואפ נקבעה ל-${result.formattedDate}`)
                } else {
                  alert(result.error || 'שגיאה ביצירת תזכורת')
                }
              } catch { alert('שגיאה ביצירת תזכורת') }
            }}
            disabled={!data.clientName}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm font-bold disabled:opacity-50"
          >
            📅 תזכורת פולואפ
          </button>
        </div>
      </div>

      <div className="flex h-[calc(100vh-65px)]">
        {/* ─── LEFT: Form ─── */}
        <div className="w-1/2 overflow-y-auto p-6 space-y-6">

          {/* Header fields */}
          <Section title="פרטים כלליים">
            <div className="grid grid-cols-2 gap-4">
              <Input label="שם הלקוח" value={data.clientName} onChange={v => updateField('clientName', v)} required />
              <Input label="שם הקמפיין" value={data.campaignName} onChange={v => updateField('campaignName', v)} required />
              <Input label="תאריך" value={data.date} onChange={v => updateField('date', v)} />
              <Input label="שם איש קשר" value={data.contactName} onChange={v => updateField('contactName', v)} />
              <Input label="פלטפורמה" value={data.platform} onChange={v => updateField('platform', v)} />
              <Input label="תקופת הסכם" value={data.contractPeriod} onChange={v => updateField('contractPeriod', v)} placeholder="מרץ 26" />
            </div>
          </Section>

          {/* Services checkboxes */}
          <Section title="שירותים (ניהול שוטף)">
            <div className="space-y-2">
              {PRICE_QUOTE_SERVICES.map(service => (
                <label
                  key={service.id}
                  className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 hover:border-orange-300 cursor-pointer transition"
                >
                  <input
                    type="checkbox"
                    checked={data.selectedServiceIds.includes(service.id)}
                    onChange={() => toggleService(service.id)}
                    className="mt-1 w-4 h-4 accent-orange-500"
                  />
                  <div>
                    <div className="font-semibold text-sm text-gray-800">{service.title}</div>
                    {service.description && (
                      <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{service.description}</div>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </Section>

          {/* Budget table */}
          <Section title="תקציב">
            {data.budgetItems.map((item, i) => (
              <div key={i} className="flex gap-2 mb-2 items-end">
                <Input label="שירות" value={item.service} onChange={v => updateBudgetItem(i, 'service', v)} className="flex-1" />
                <Input label="פירוט" value={item.detail} onChange={v => updateBudgetItem(i, 'detail', v)} className="flex-1" />
                <Input label="תקציב" value={item.price || ''} onChange={v => updateBudgetItem(i, 'price', v)} className="w-28" />
                {data.budgetItems.length > 1 && (
                  <button onClick={() => removeBudgetItem(i)} className="text-red-400 hover:text-red-600 pb-2 text-lg">✕</button>
                )}
              </div>
            ))}
            <div className="flex gap-3 items-center mt-2">
              <button onClick={addBudgetItem} className="text-sm text-orange-600 hover:text-orange-700 font-medium">+ שורה</button>
              <Input label='סה"כ תקציב' value={data.totalBudget} onChange={v => updateField('totalBudget', v)} placeholder="90,000₪" className="w-40" />
            </div>
          </Section>

          {/* Content mix */}
          <Section title="תמהיל תוכן">
            {data.contentMix.map((item, i) => (
              <div key={i} className="flex gap-2 mb-2 items-end">
                <Input label="פירוט" value={item.detail} onChange={v => updateContentMix(i, 'detail', v)} className="flex-1" />
                <Input label="חודשי פר משפיען" value={item.monthlyPerInfluencer} onChange={v => updateContentMix(i, 'monthlyPerInfluencer', v)} className="flex-1" />
                <Input label='סה"כ' value={item.total} onChange={v => updateContentMix(i, 'total', v)} className="flex-1" />
                {data.contentMix.length > 1 && (
                  <button onClick={() => removeContentMix(i)} className="text-red-400 hover:text-red-600 pb-2 text-lg">✕</button>
                )}
              </div>
            ))}
            <button onClick={addContentMix} className="text-sm text-orange-600 hover:text-orange-700 font-medium mt-1">+ שורה</button>
          </Section>

          {/* KPI */}
          <Section title="KPI">
            <div className="grid grid-cols-2 gap-4">
              <Input label="CPV" value={data.kpi.cpv} onChange={v => updateField('kpi', { ...data.kpi, cpv: v })} placeholder="0.18" />
              <Input label="כמות חשיפות משוערת" value={data.kpi.estimatedImpressions} onChange={v => updateField('kpi', { ...data.kpi, estimatedImpressions: v })} placeholder="700,000" />
            </div>
          </Section>

          {/* Additional notes */}
          <Section title="הערות נוספות (עמוד תוצרים)">
            {data.additionalNotes.map((note, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input
                  value={note}
                  onChange={e => updateNote(i, e.target.value)}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="הערה נוספת..."
                />
                <button onClick={() => removeNote(i)} className="text-red-400 hover:text-red-600 text-lg">✕</button>
              </div>
            ))}
            <button onClick={addNote} className="text-sm text-orange-600 hover:text-orange-700 font-medium">+ הערה</button>
          </Section>

          <div className="h-10" />
        </div>

        {/* ─── RIGHT: Preview ─── */}
        <div className="w-1/2 bg-gray-200 border-r flex flex-col">
          {/* Page tabs */}
          <div className="flex gap-1 p-3 bg-gray-100 border-b">
            {[1, 2, 3, 4].map(p => (
              <button
                key={p}
                onClick={() => setPreviewPage(p)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
                  previewPage === p
                    ? 'bg-orange-500 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                עמוד {p}
              </button>
            ))}
          </div>

          {/* Preview iframe */}
          <div className="flex-1 overflow-auto flex items-start justify-center p-4">
            <div className="bg-white shadow-2xl" style={{ width: 595, height: 842 }}>
              <iframe
                ref={iframeRef}
                key={previewKey}
                src={previewUrl}
                className="w-full h-full border-0"
                style={{ transform: 'scale(0.75)', transformOrigin: 'top right', width: '133.33%', height: '133.33%' }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Reusable Components ───

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="text-lg font-bold text-gray-800 mb-4 pb-2 border-b border-gray-100">{title}</h2>
      {children}
    </div>
  )
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  required,
  className = '',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  required?: boolean
  className?: string
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-gray-500 mb-1">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-orange-400 focus:ring-1 focus:ring-orange-400 outline-none transition"
      />
    </div>
  )
}
