'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button, Card } from '@/components/ui'
import { formatDate, formatCurrency } from '@/lib/utils'
import type { Document } from '@/types/database'

// Structured chat data type (flat structure from quote-schema)
interface StructuredQuoteData {
  language?: string
  docTitle?: string
  clientName?: string
  contactPerson?: string
  issueDate?: string
  brandName?: string
  brandCategory?: string
  brandDescription?: string
  usp?: string
  toneOfVoice?: string[]
  brandLinks?: string[]
  goals?: string[]
  goalsFreeText?: string
  targetGender?: string
  targetAgeRange?: string
  targetBehavior?: string
  targetGeo?: string
  bigIdea?: string
  keyMessages?: string[]
  cta?: string
  hashtags?: string[]
  dos?: string[]
  donts?: string[]
  budget?: number
  currency?: string
  potentialEngagement?: number
  primaryInfluencers?: number
  distributionInfluencers?: number
  closingHeadline?: string
  contactDetails?: string
  [key: string]: unknown
}

async function requestArtifact(
  endpoint: string,
  documentId: string,
): Promise<{ url: string; fileName: string }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 180_000) // 3 min
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ documentId }),
      signal: controller.signal,
    })
    const text = await res.text()
    let json: Record<string, unknown> = {}
    try { json = JSON.parse(text) } catch { /* non-JSON error body */ }
    if (!res.ok) {
      const detail = (json.error as string) || text.slice(0, 200) || `HTTP ${res.status}`
      throw new Error(`${res.status}: ${detail}`)
    }
    const url = (json.pdfUrl || json.pptxUrl) as string | undefined
    const fileName = (json.fileName as string) || 'download'
    if (!url) throw new Error('no download URL returned')
    return { url, fileName }
  } finally {
    clearTimeout(timeout)
  }
}

function triggerDownload(url: string, fileName: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.target = '_blank'
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export default function PreviewPage() {
  const router = useRouter()
  const params = useParams()
  const [document, setDocument] = useState<Document | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)

  useEffect(() => {
    loadDocument()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id])

  const loadDocument = async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', params.id)
      .single()

    if (error || !data) {
      console.error('Error loading document:', error)
      router.push('/documents')
      return
    }

    setDocument(data)
    setIsLoading(false)
  }

  const downloadPdf = async () => {
    if (!document) return
    setIsGenerating(true)
    try {
      const { url, fileName } = await requestArtifact('/api/pdf', document.id)
      triggerDownload(url, fileName)
    } catch (error) {
      console.error('Error downloading PDF:', error)
      alert(`שגיאה ביצירת ה-PDF\n${error instanceof Error ? error.message : ''}`)
    } finally {
      setIsGenerating(false)
    }
  }

  const downloadPptx = async () => {
    if (!document) return
    setIsGenerating(true)
    try {
      const { url, fileName } = await requestArtifact('/api/export-pptx', document.id)
      triggerDownload(url, fileName)
    } catch (error) {
      console.error('Error downloading PPTX:', error)
      alert(`שגיאה ביצירת ה-PowerPoint\n${error instanceof Error ? error.message : ''}`)
    } finally {
      setIsGenerating(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-500">טוען מסמך...</p>
        </div>
      </div>
    )
  }

  if (!document) {
    return null
  }

  const data = document.data as StructuredQuoteData
  const isQuote = document.type === 'quote'

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 py-8">
      <div className="max-w-5xl mx-auto px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link href="/documents">
              <Button variant="ghost" size="sm">
                → חזרה לרשימה
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">{document.title}</h1>
              <div className="flex items-center gap-3 mt-1">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  isQuote 
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-purple-100 text-purple-700'
                }`}>
                  {isQuote ? 'הצעת מחיר' : 'מצגת'}
                </span>
                <span className="text-sm text-gray-500">
                  {formatDate(document.created_at)}
                </span>
              </div>
            </div>
          </div>

          <Button
            variant="primary"
            onClick={downloadPdf}
            disabled={isGenerating}
            className="bg-gradient-to-l from-blue-600 to-purple-600"
          >
            {isGenerating ? (
              <>
                <span className="animate-spin mr-2">⏳</span>
                מייצר PDF...
              </>
            ) : (
              <>📥 הורד PDF</>
            )}
          </Button>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Preview Card */}
          <div className="lg:col-span-2">
            <Card className="p-6 bg-white">
              <h2 className="font-bold text-lg mb-6 flex items-center gap-2">
                👁️ תצוגה מקדימה
              </h2>
              
              <QuotePreviewNew data={data} />
            </Card>
          </div>

          {/* Details Sidebar */}
          <div>
            <Card className="p-6 bg-white">
              <h2 className="font-bold text-lg mb-4">📋 סיכום הנתונים</h2>
              <DataSummary data={data} />
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

function QuotePreviewNew({ data }: { data: StructuredQuoteData }) {
  const getCurrency = () => {
    if (data.currency?.includes('ILS') || data.currency?.includes('₪')) return '₪'
    if (data.currency?.includes('USD') || data.currency?.includes('$')) return '$'
    if (data.currency?.includes('EUR') || data.currency?.includes('€')) return '€'
    return '₪'
  }

  return (
    <div 
      className="bg-white border-2 border-gray-200 rounded-xl overflow-hidden shadow-lg"
      style={{ aspectRatio: '210/297' }}
    >
      {/* Cover - Brand colors gradient */}
      <div className="h-1/4 bg-gradient-to-br from-blue-600 via-purple-600 to-pink-500 p-6 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/20 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2" />
        </div>
        <div className="relative z-10 h-full flex flex-col justify-center">
          <h1 className="text-2xl font-bold mb-2">{data.docTitle || 'הצעת קמפיין'}</h1>
          {data.brandName && (
            <p className="text-white/80 text-lg">עבור {data.brandName}</p>
          )}
          {data.clientName && (
            <p className="text-white/60 text-sm mt-1">לכבוד: {data.clientName}</p>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-6 h-3/4 flex flex-col text-sm">
        {/* Brand Info */}
        {data.brandDescription && (
          <div className="mb-4 pb-4 border-b">
            <h3 className="font-bold text-gray-700 mb-2">🏷️ על המותג</h3>
            <p className="text-gray-600 text-xs line-clamp-3">{data.brandDescription}</p>
          </div>
        )}

        {/* Goals */}
        {data.goals && data.goals.length > 0 && (
          <div className="mb-4 pb-4 border-b">
            <h3 className="font-bold text-gray-700 mb-2">🎯 מטרות</h3>
            <div className="flex flex-wrap gap-1">
              {data.goals.filter(g => g !== '__skipped__').map((goal, i) => (
                <span key={i} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs">
                  {goal}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Big Idea */}
        {data.bigIdea && (
          <div className="mb-4 pb-4 border-b">
            <h3 className="font-bold text-gray-700 mb-2">💡 הרעיון המרכזי</h3>
            <p className="text-gray-600 text-xs line-clamp-2">{data.bigIdea}</p>
          </div>
        )}

        {/* Key Messages */}
        {data.keyMessages && data.keyMessages.length > 0 && (
          <div className="mb-4 pb-4 border-b">
            <h3 className="font-bold text-gray-700 mb-2">📝 מסרים עיקריים</h3>
            <ul className="text-xs text-gray-600 space-y-1">
              {data.keyMessages.slice(0, 3).map((msg, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-blue-500">•</span>
                  <span className="line-clamp-1">{msg}</span>
                </li>
              ))}
              {data.keyMessages.length > 3 && (
                <li className="text-gray-400">+{data.keyMessages.length - 3} נוספים</li>
              )}
            </ul>
          </div>
        )}

        {/* Budget & Stats - at bottom */}
        <div className="mt-auto pt-4 border-t bg-gray-50 -mx-6 -mb-6 px-6 py-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            {data.budget && (
              <div>
                <p className="text-xs text-gray-500">תקציב</p>
                <p className="font-bold text-blue-600">
                  {getCurrency()}{data.budget.toLocaleString()}
                </p>
              </div>
            )}
            {data.potentialEngagement && (
              <div>
                <p className="text-xs text-gray-500">Engagement</p>
                <p className="font-bold text-purple-600">
                  {data.potentialEngagement.toLocaleString()}
                </p>
              </div>
            )}
            {(data.primaryInfluencers || data.distributionInfluencers) && (
              <div>
                <p className="text-xs text-gray-500">משפיענים</p>
                <p className="font-bold text-pink-600">
                  {(data.primaryInfluencers || 0) + (data.distributionInfluencers || 0)}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function DataSummary({ data }: { data: StructuredQuoteData }) {
  // Filter out skipped and empty values
  const entries = Object.entries(data).filter(([key, value]) => {
    if (value === '__skipped__' || value === undefined || value === null || value === '') return false
    if (Array.isArray(value) && value.length === 0) return false
    if (key.startsWith('_')) return false
    return true
  })

  const labels: Record<string, string> = {
    language: 'שפה',
    docTitle: 'כותרת',
    clientName: 'לקוח',
    contactPerson: 'איש קשר',
    issueDate: 'תאריך',
    brandName: 'מותג',
    brandCategory: 'קטגוריה',
    brandDescription: 'תיאור',
    usp: 'USP',
    toneOfVoice: 'טון דיבור',
    brandLinks: 'קישורים',
    goals: 'מטרות',
    goalsFreeText: 'פירוט מטרות',
    targetGender: 'מגדר',
    targetAgeRange: 'גילאים',
    targetBehavior: 'התנהגות',
    targetGeo: 'אזור',
    bigIdea: 'רעיון מרכזי',
    keyMessages: 'מסרים',
    cta: 'CTA',
    hashtags: 'האשטגים',
    dos: "Do's",
    donts: "Don'ts",
    budget: 'תקציב',
    currency: 'מטבע',
    potentialEngagement: 'Engagement',
    primaryInfluencers: 'משפיענים מרכזיים',
    distributionInfluencers: 'משפיעני הפצה',
    closingHeadline: 'כותרת סיום',
    contactDetails: 'פרטי קשר',
  }

  return (
    <div className="space-y-3 max-h-[500px] overflow-y-auto">
      {entries.map(([key, value]) => (
        <div key={key} className="border-b pb-2">
          <p className="text-xs text-gray-500 mb-1">{labels[key] || key}</p>
          <p className="text-sm text-gray-800">
            {Array.isArray(value) 
              ? value.filter(v => v !== '__skipped__').join(', ')
              : typeof value === 'number'
                ? value.toLocaleString()
                : String(value)
            }
          </p>
        </div>
      ))}
    </div>
  )
}
