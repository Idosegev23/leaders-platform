'use client'

import { useState, useCallback, useRef } from 'react'
import { PRICE_QUOTE_SERVICES, LEADERS_ABOUT_TEXT, LEGAL_TERMS, PAYMENT_TERMS, CLIENT_DECLARATION } from '@/lib/constants/price-quote-services'
import type {
  PriceQuoteData,
  BudgetItem,
  ContentMixItem,
  CustomSection,
  CustomSectionStyle,
  CustomSectionType,
  SectionToggles,
  QuoteService,
  PageIndex,
} from '@/types/price-quote'
import { SendForSignatureDialog } from '@/components/price-quote/SendForSignatureDialog'
import CustomerPicker from '@/components/customer-picker/CustomerPicker'

// ─── Default state ───
const defaultBudgetItems: BudgetItem[] = [
  { service: 'משפיענים', detail: '', price: '' },
  { service: 'יוצרי תוכן UGC', detail: '', price: '' },
]

const defaultContentMix: ContentMixItem[] = [
  { detail: '', monthlyPerInfluencer: '', total: '' },
]

const defaultToggles: SectionToggles = {
  aboutLeaders: true,
  services: true,
  budget: true,
  contentMix: true,
  kpi: true,
  deliverables: true,
  paymentTerms: true,
  declaration: true,
  signature: true,
}

const defaultServices: QuoteService[] = PRICE_QUOTE_SERVICES.map(s => ({
  id: s.id,
  title: s.title,
  description: s.description,
  selected: s.defaultSelected,
}))

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
  enabledSections: { ...defaultToggles },
  enabledPages: { 1: true, 2: true, 3: true, 4: true },
  aboutLeadersText: LEADERS_ABOUT_TEXT,
  servicesTitle: 'ניהול שוטף',
  deliverablesTitle: 'תוצרים ושירותים',
  legalTerms: [...LEGAL_TERMS],
  paymentTerms: { ...PAYMENT_TERMS },
  clientDeclarationText: CLIENT_DECLARATION,
  customSections: [],
  services: defaultServices,
}

function genId(): string {
  return `cs_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
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

  const toggleSection = useCallback((key: keyof SectionToggles) => {
    setData(prev => {
      const current = prev.enabledSections ?? defaultToggles
      const currentValue = current[key] ?? defaultToggles[key]
      return {
        ...prev,
        enabledSections: { ...current, [key]: !currentValue },
      }
    })
  }, [])

  const isSectionOn = useCallback(
    (key: keyof SectionToggles) => data.enabledSections?.[key] ?? defaultToggles[key],
    [data.enabledSections],
  )

  // ─── Customer picker handler ───
  // When the user picks a client that has a completed brief, we pull
  // submission_data and pre-fill the campaign name + contact name.
  // Saves the team from re-typing what's already in the brief.
  const onClientPicked = useCallback(async (opt: { name: string; briefLinkToken?: string }) => {
    setData(prev => ({ ...prev, clientName: opt.name }))
    if (!opt.briefLinkToken) return
    try {
      const res = await fetch(`/api/links/${opt.briefLinkToken}`)
      if (!res.ok) return
      const link = (await res.json()) as { metadata?: { submission_data?: Record<string, unknown> } }
      const sub = link.metadata?.submission_data
      if (!sub) return
      const pick = (k: string) => (typeof sub[k] === 'string' ? (sub[k] as string) : '')
      const candidates = {
        campaignName: ['campaign_name', 'campaignName', 'campaign'],
        contactName: ['contact_name', 'contactName', 'mainContact', 'pointOfContact'],
      }
      setData(prev => {
        const next = { ...prev }
        for (const c of candidates.campaignName) { const v = pick(c); if (v) { next.campaignName = v; break } }
        for (const c of candidates.contactName)  { const v = pick(c); if (v) { next.contactName  = v; break } }
        return next
      })
    } catch { /* non-fatal */ }
  }, [])

  // ─── Service list (editable) ───
  const updateServiceField = useCallback(<K extends keyof QuoteService>(id: string, field: K, value: QuoteService[K]) => {
    setData(prev => {
      const services = (prev.services ?? defaultServices).map(s =>
        s.id === id ? { ...s, [field]: value } : s,
      )
      // Keep legacy `selectedServiceIds` in sync for any back-compat consumers.
      const selectedServiceIds = services.filter(s => s.selected).map(s => s.id)
      return { ...prev, services, selectedServiceIds }
    })
  }, [])

  const addService = useCallback(() => {
    setData(prev => {
      const services = [
        ...(prev.services ?? defaultServices),
        { id: `svc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, title: '', description: '', selected: true },
      ]
      const selectedServiceIds = services.filter(s => s.selected).map(s => s.id)
      return { ...prev, services, selectedServiceIds }
    })
  }, [])

  const removeService = useCallback((id: string) => {
    setData(prev => {
      const services = (prev.services ?? defaultServices).filter(s => s.id !== id)
      const selectedServiceIds = services.filter(s => s.selected).map(s => s.id)
      return { ...prev, services, selectedServiceIds }
    })
  }, [])

  // ─── Page-level enable/disable ───
  const togglePage = useCallback((page: PageIndex) => {
    setData(prev => {
      const current = prev.enabledPages ?? { 1: true, 2: true, 3: true, 4: true }
      const currentValue = current[page] ?? true
      return { ...prev, enabledPages: { ...current, [page]: !currentValue } }
    })
  }, [])

  const isPageOn = useCallback(
    (page: PageIndex) => data.enabledPages?.[page] ?? true,
    [data.enabledPages],
  )

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

  // ─── Legal terms ───
  const updateLegalTerm = useCallback((index: number, value: string) => {
    setData(prev => {
      const arr = [...(prev.legalTerms ?? LEGAL_TERMS)]
      arr[index] = value
      return { ...prev, legalTerms: arr }
    })
  }, [])

  const addLegalTerm = useCallback(() => {
    setData(prev => ({
      ...prev,
      legalTerms: [...(prev.legalTerms ?? LEGAL_TERMS), ''],
    }))
  }, [])

  const removeLegalTerm = useCallback((index: number) => {
    setData(prev => ({
      ...prev,
      legalTerms: (prev.legalTerms ?? LEGAL_TERMS).filter((_, i) => i !== index),
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

  // ─── Custom sections ───
  const addCustomSection = useCallback((page: 1 | 2 | 3 | 4) => {
    setData(prev => ({
      ...prev,
      customSections: [
        ...(prev.customSections ?? []),
        {
          id: genId(),
          page,
          style: 'orange',
          type: 'bullets',
          title: 'קטע חדש',
          items: [''],
          enabled: true,
        } satisfies CustomSection,
      ],
    }))
  }, [])

  const updateCustomSection = useCallback(<K extends keyof CustomSection>(id: string, field: K, value: CustomSection[K]) => {
    setData(prev => ({
      ...prev,
      customSections: (prev.customSections ?? []).map(s =>
        s.id === id ? { ...s, [field]: value } : s,
      ),
    }))
  }, [])

  const removeCustomSection = useCallback((id: string) => {
    setData(prev => ({
      ...prev,
      customSections: (prev.customSections ?? []).filter(s => s.id !== id),
    }))
  }, [])

  const updateCustomSectionItem = useCallback((id: string, index: number, value: string) => {
    setData(prev => ({
      ...prev,
      customSections: (prev.customSections ?? []).map(s => {
        if (s.id !== id) return s
        const items = [...s.items]
        items[index] = value
        return { ...s, items }
      }),
    }))
  }, [])

  const addCustomSectionItem = useCallback((id: string) => {
    setData(prev => ({
      ...prev,
      customSections: (prev.customSections ?? []).map(s =>
        s.id === id ? { ...s, items: [...s.items, ''] } : s,
      ),
    }))
  }, [])

  const removeCustomSectionItem = useCallback((id: string, index: number) => {
    setData(prev => ({
      ...prev,
      customSections: (prev.customSections ?? []).map(s =>
        s.id === id ? { ...s, items: s.items.filter((_, i) => i !== index) } : s,
      ),
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

  // Lookup which custom sections belong to which page
  const customSectionsByPage = (page: 1 | 2 | 3 | 4) =>
    (data.customSections ?? []).filter(s => s.page === page)

  return (
    <div dir="rtl" className="min-h-screen bg-gray-50">
      <SendForSignatureDialog
        open={signDialogOpen}
        onClose={() => setSignDialogOpen(false)}
        defaultTitle={`הצעת מחיר · ${data.clientName || ''}${data.campaignName ? ' · ' + data.campaignName : ''}`.trim()}
        generatePdfBase64={generatePdfBase64}
        quoteData={data}
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
              <CustomerPicker
                value={data.clientName}
                onChange={onClientPicked}
                required
                label="שם הלקוח"
                placeholder="בחר לקוח קיים או הוסף חדש"
                className="col-span-1"
              />
              <Input label="שם הקמפיין" value={data.campaignName} onChange={v => updateField('campaignName', v)} required />
              <Input label="תאריך" value={data.date} onChange={v => updateField('date', v)} />
              <Input label="שם איש קשר" value={data.contactName} onChange={v => updateField('contactName', v)} />
              <Input label="פלטפורמה" value={data.platform} onChange={v => updateField('platform', v)} />
              <Input label="תקופת הסכם" value={data.contractPeriod} onChange={v => updateField('contractPeriod', v)} placeholder="מרץ 26" />
            </div>
          </Section>

          {/* Page-level toggles — entirely remove a page from the PDF */}
          <Section title="הכללת עמודים ב-PDF">
            <div className="text-xs text-gray-500 mb-3">
              עמוד שמכובה לא יופיע ב-PDF הסופי. בתצוגה המקדימה משמאל הוא עדיין גלוי כדי שתוכלי להמשיך לערוך לפני שמחזירים.
            </div>
            <div className="flex gap-2 flex-wrap">
              {([1, 2, 3, 4] as PageIndex[]).map(p => {
                const on = isPageOn(p)
                return (
                  <button
                    key={p}
                    onClick={() => togglePage(p)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition border ${
                      on
                        ? 'bg-green-50 border-green-300 text-green-700 hover:bg-green-100'
                        : 'bg-gray-100 border-gray-300 text-gray-500 hover:bg-gray-200'
                    }`}
                    title={on ? 'לחיצה כדי להסיר עמוד מה-PDF' : 'לחיצה כדי להחזיר עמוד ל-PDF'}
                  >
                    {on ? '● ' : '○ '}עמוד {p}
                  </button>
                )
              })}
            </div>
          </Section>

          {/* ═══ PAGE 1 ═══ */}
          <PageDivider page={1} />

          {/* About Leaders — editable */}
          <Section
            title='פסקת "לידרס" (תיאור החברה)'
            page={1}
            on={isSectionOn('aboutLeaders')}
            onToggle={() => toggleSection('aboutLeaders')}
          >
            <Textarea
              label="טקסט (פסקאות מופרדות בשורה ריקה)"
              value={data.aboutLeadersText ?? ''}
              onChange={v => updateField('aboutLeadersText', v)}
              rows={8}
            />
          </Section>

          {/* Services checkboxes */}
          <Section
            title="שירותים (ניהול שוטף)"
            page={1}
            on={isSectionOn('services')}
            onToggle={() => toggleSection('services')}
          >
            <Input
              label="כותרת הקטע"
              value={data.servicesTitle ?? ''}
              onChange={v => updateField('servicesTitle', v)}
              placeholder="ניהול שוטף"
            />
            <div className="space-y-3 mt-3">
              {(data.services ?? defaultServices).map(service => (
                <div
                  key={service.id}
                  className={`rounded-lg border p-3 transition ${
                    service.selected ? 'border-orange-300 bg-orange-50/30' : 'border-gray-200 bg-gray-50/40'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="checkbox"
                      checked={service.selected}
                      onChange={e => updateServiceField(service.id, 'selected', e.target.checked)}
                      className="w-4 h-4 accent-orange-500"
                      title={service.selected ? 'יוצג בהצעה' : 'לא יוצג'}
                    />
                    <input
                      value={service.title}
                      onChange={e => updateServiceField(service.id, 'title', e.target.value)}
                      placeholder="כותרת שירות"
                      className="flex-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm font-semibold focus:border-orange-400 outline-none"
                    />
                    <button
                      onClick={() => removeService(service.id)}
                      className="text-red-400 hover:text-red-600 text-lg px-1"
                      title="הסר שירות"
                    >
                      ✕
                    </button>
                  </div>
                  <textarea
                    value={service.description}
                    onChange={e => updateServiceField(service.id, 'description', e.target.value)}
                    placeholder="תיאור (יוצג אחרי המקף)"
                    rows={2}
                    className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-xs focus:border-orange-400 outline-none"
                  />
                </div>
              ))}
              <button
                onClick={addService}
                className="text-sm text-orange-600 hover:text-orange-700 font-medium"
              >
                + הוסף שירות
              </button>
            </div>
          </Section>

          <CustomSectionsPanel
            page={1}
            sections={customSectionsByPage(1)}
            onAdd={() => addCustomSection(1)}
            onUpdate={updateCustomSection}
            onRemove={removeCustomSection}
            onUpdateItem={updateCustomSectionItem}
            onAddItem={addCustomSectionItem}
            onRemoveItem={removeCustomSectionItem}
          />

          {/* ═══ PAGE 2 ═══ */}
          <PageDivider page={2} />

          {/* Budget table */}
          <Section
            title="תקציב"
            page={2}
            on={isSectionOn('budget')}
            onToggle={() => toggleSection('budget')}
          >
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
          <Section
            title="תמהיל תוכן"
            page={2}
            on={isSectionOn('contentMix')}
            onToggle={() => toggleSection('contentMix')}
          >
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
          <Section
            title="KPI"
            page={2}
            on={isSectionOn('kpi')}
            onToggle={() => toggleSection('kpi')}
          >
            <div className="grid grid-cols-2 gap-4">
              <Input label="CPV" value={data.kpi.cpv} onChange={v => updateField('kpi', { ...data.kpi, cpv: v })} placeholder="0.18" />
              <Input label="כמות חשיפות משוערת" value={data.kpi.estimatedImpressions} onChange={v => updateField('kpi', { ...data.kpi, estimatedImpressions: v })} placeholder="700,000" />
            </div>
          </Section>

          <CustomSectionsPanel
            page={2}
            sections={customSectionsByPage(2)}
            onAdd={() => addCustomSection(2)}
            onUpdate={updateCustomSection}
            onRemove={removeCustomSection}
            onUpdateItem={updateCustomSectionItem}
            onAddItem={addCustomSectionItem}
            onRemoveItem={removeCustomSectionItem}
          />

          {/* ═══ PAGE 3 ═══ */}
          <PageDivider page={3} />

          {/* Deliverables block — title + per-deliverable notes + legal terms */}
          <Section
            title="תוצרים, תנאים וסעיפים משפטיים"
            page={3}
            on={isSectionOn('deliverables')}
            onToggle={() => toggleSection('deliverables')}
          >
            <Input
              label="כותרת הקטע"
              value={data.deliverablesTitle ?? ''}
              onChange={v => updateField('deliverablesTitle', v)}
              placeholder="תוצרים ושירותים"
            />

            <div className="mt-4">
              <div className="text-xs font-semibold text-gray-600 mb-2">הערות נוספות לתוצרים</div>
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
            </div>

            <div className="mt-5">
              <div className="text-xs font-semibold text-gray-600 mb-2">סעיפים משפטיים (ניתן לערוך/למחוק/להוסיף)</div>
              {(data.legalTerms ?? LEGAL_TERMS).map((term, i) => (
                <div key={i} className="flex gap-2 mb-2 items-start">
                  <textarea
                    value={term}
                    onChange={e => updateLegalTerm(i, e.target.value)}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    rows={2}
                  />
                  <button onClick={() => removeLegalTerm(i)} className="text-red-400 hover:text-red-600 text-lg pt-2">✕</button>
                </div>
              ))}
              <button onClick={addLegalTerm} className="text-sm text-orange-600 hover:text-orange-700 font-medium">+ סעיף משפטי</button>
            </div>
          </Section>

          <CustomSectionsPanel
            page={3}
            sections={customSectionsByPage(3)}
            onAdd={() => addCustomSection(3)}
            onUpdate={updateCustomSection}
            onRemove={removeCustomSection}
            onUpdateItem={updateCustomSectionItem}
            onAddItem={addCustomSectionItem}
            onRemoveItem={removeCustomSectionItem}
          />

          {/* ═══ PAGE 4 ═══ */}
          <PageDivider page={4} />

          <Section
            title="תוקף ותנאי תשלום"
            page={4}
            on={isSectionOn('paymentTerms')}
            onToggle={() => toggleSection('paymentTerms')}
          >
            <Textarea
              label="תנאי הפעלה"
              value={data.paymentTerms?.activation ?? ''}
              onChange={v => updateField('paymentTerms', { ...(data.paymentTerms ?? PAYMENT_TERMS), activation: v })}
              rows={2}
            />
            <div className="h-2" />
            <Textarea
              label="תנאי תשלום"
              value={data.paymentTerms?.payment ?? ''}
              onChange={v => updateField('paymentTerms', { ...(data.paymentTerms ?? PAYMENT_TERMS), payment: v })}
              rows={2}
            />
          </Section>

          <Section
            title="הצהרה ואישור הלקוח"
            page={4}
            on={isSectionOn('declaration')}
            onToggle={() => toggleSection('declaration')}
          >
            <Textarea
              label="טקסט ההצהרה"
              value={data.clientDeclarationText ?? ''}
              onChange={v => updateField('clientDeclarationText', v)}
              rows={3}
            />
          </Section>

          <Section
            title="בלוק חתימה"
            page={4}
            on={isSectionOn('signature')}
            onToggle={() => toggleSection('signature')}
          >
            <div className="text-xs text-gray-500">
              שדות החתימה מתמלאים אוטומטית כשהלקוח חותם דרך הקישור. בכיבוי הקטע — בלוק החתימה לא יופיע בהצעה.
            </div>
          </Section>

          <CustomSectionsPanel
            page={4}
            sections={customSectionsByPage(4)}
            onAdd={() => addCustomSection(4)}
            onUpdate={updateCustomSection}
            onRemove={removeCustomSection}
            onUpdateItem={updateCustomSectionItem}
            onAddItem={addCustomSectionItem}
            onRemoveItem={removeCustomSectionItem}
          />

          <div className="h-10" />
        </div>

        {/* ─── RIGHT: Preview ─── */}
        <div className="w-1/2 bg-gray-200 border-r flex flex-col">
          {/* Page tabs */}
          <div className="flex gap-1 p-3 bg-gray-100 border-b">
            {([1, 2, 3, 4] as PageIndex[]).map(p => {
              const active = previewPage === p
              const inPdf = isPageOn(p)
              return (
                <button
                  key={p}
                  onClick={() => setPreviewPage(p)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${
                    active
                      ? 'bg-orange-500 text-white'
                      : inPdf
                        ? 'bg-white text-gray-600 hover:bg-gray-50'
                        : 'bg-gray-200 text-gray-400 hover:bg-gray-100 line-through'
                  }`}
                  title={inPdf ? 'יופיע ב-PDF' : 'לא יופיע ב-PDF (מבוטל)'}
                >
                  עמוד {p}
                  {!inPdf && <span className="text-[10px] no-underline">⊘</span>}
                </button>
              )
            })}
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

function PageDivider({ page }: { page: number }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <div className="h-px flex-1 bg-gray-300" />
      <span className="text-xs font-bold text-gray-500 px-3 py-1 rounded-full bg-gray-200">עמוד {page}</span>
      <div className="h-px flex-1 bg-gray-300" />
    </div>
  )
}

function Section({
  title,
  children,
  page,
  on = true,
  onToggle,
}: {
  title: string
  children: React.ReactNode
  page?: number
  on?: boolean
  onToggle?: () => void
}) {
  return (
    <div className={`bg-white rounded-xl border ${on ? 'border-gray-200' : 'border-gray-200 opacity-60'} p-5`}>
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-gray-800">{title}</h2>
          {page !== undefined && (
            <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">עמ' {page}</span>
          )}
        </div>
        {onToggle && (
          <button
            onClick={onToggle}
            className={`text-xs px-3 py-1 rounded-full font-medium transition ${
              on
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
            }`}
            title={on ? 'הסר קטע מההצעה' : 'הפעל קטע בחזרה'}
          >
            {on ? '● פעיל' : '○ מבוטל'}
          </button>
        )}
      </div>
      <div className={on ? '' : 'pointer-events-none select-none'}>{children}</div>
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

function Textarea({
  label,
  value,
  onChange,
  rows = 4,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  rows?: number
  placeholder?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-orange-400 focus:ring-1 focus:ring-orange-400 outline-none transition resize-y"
      />
    </div>
  )
}

function CustomSectionsPanel({
  page,
  sections,
  onAdd,
  onUpdate,
  onRemove,
  onUpdateItem,
  onAddItem,
  onRemoveItem,
}: {
  page: 1 | 2 | 3 | 4
  sections: CustomSection[]
  onAdd: () => void
  onUpdate: <K extends keyof CustomSection>(id: string, field: K, value: CustomSection[K]) => void
  onRemove: (id: string) => void
  onUpdateItem: (id: string, index: number, value: string) => void
  onAddItem: (id: string) => void
  onRemoveItem: (id: string, index: number) => void
}) {
  return (
    <div className="bg-orange-50/50 rounded-xl border border-dashed border-orange-300 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold text-orange-700">קטעים מותאמים בעמוד {page}</div>
        <button
          onClick={onAdd}
          className="text-xs px-3 py-1.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 font-medium"
        >
          + הוסף קטע
        </button>
      </div>
      {sections.length === 0 && (
        <div className="text-xs text-gray-500 italic">אין קטעים מותאמים. לחצי על "+ הוסף קטע" כדי להוסיף בלוק חדש לעמוד {page}.</div>
      )}
      {sections.map(s => (
        <div key={s.id} className="bg-white rounded-lg border border-orange-200 p-4 mb-3">
          <div className="flex items-center justify-between mb-3">
            <Input
              label="כותרת"
              value={s.title}
              onChange={v => onUpdate(s.id, 'title', v)}
              className="flex-1"
            />
            <div className="flex items-center gap-2 mr-3 pt-5">
              <button
                onClick={() => onUpdate(s.id, 'enabled', !s.enabled)}
                className={`text-xs px-3 py-1 rounded-full font-medium transition ${
                  s.enabled
                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                    : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
                }`}
              >
                {s.enabled ? '● פעיל' : '○ מבוטל'}
              </button>
              <button
                onClick={() => onRemove(s.id)}
                className="text-red-400 hover:text-red-600 text-lg"
                title="מחק קטע"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">סגנון כותרת</label>
              <select
                value={s.style}
                onChange={e => onUpdate(s.id, 'style', e.target.value as CustomSectionStyle)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="orange">כתום</option>
                <option value="dark">כהה</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">סוג תוכן</label>
              <select
                value={s.type}
                onChange={e => onUpdate(s.id, 'type', e.target.value as CustomSectionType)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="bullets">רשימת בולטים</option>
                <option value="paragraphs">פסקאות</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            {s.items.map((item, i) => (
              <div key={i} className="flex gap-2 items-start">
                <textarea
                  value={item}
                  onChange={e => onUpdateItem(s.id, i, e.target.value)}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  rows={s.type === 'paragraphs' ? 3 : 2}
                  placeholder={s.type === 'paragraphs' ? 'תוכן הפסקה...' : 'פריט ברשימה...'}
                />
                {s.items.length > 1 && (
                  <button onClick={() => onRemoveItem(s.id, i)} className="text-red-400 hover:text-red-600 text-lg pt-2">✕</button>
                )}
              </div>
            ))}
            <button onClick={() => onAddItem(s.id)} className="text-xs text-orange-600 hover:text-orange-700 font-medium">
              + {s.type === 'paragraphs' ? 'פסקה' : 'בולט'}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
