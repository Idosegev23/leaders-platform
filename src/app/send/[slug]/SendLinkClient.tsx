'use client'

import Link from 'next/link'
import { useState } from 'react'

interface DocType {
  id: string
  slug: string
  name: string
  description: string | null
  target_url: string
}

interface RecentLink {
  id: string
  token: string
  client_name: string | null
  client_email: string | null
  status: string
  created_at: string
  opened_at: string | null
  completed_at: string | null
}

const statusLabel = (s: string) =>
  s === 'pending'
    ? 'נשלח, ממתין לפתיחה'
    : s === 'opened'
    ? 'נפתח, טרם הושלם'
    : s === 'completed'
    ? 'הושלם'
    : s === 'archived'
    ? 'בארכיון'
    : s

const statusColor = (s: string) =>
  s === 'completed'
    ? 'bg-green-100 text-green-700'
    : s === 'opened'
    ? 'bg-blue-100 text-blue-700'
    : s === 'pending'
    ? 'bg-amber-100 text-amber-700'
    : 'bg-gray-100 text-gray-600'

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' })

export default function SendLinkClient({
  docType,
  recentLinks,
}: {
  docType: DocType
  recentLinks: RecentLink[]
}) {
  const [clientName, setClientName] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [language, setLanguage] = useState<'he' | 'en'>('he')
  const [personalNote, setPersonalNote] = useState('')
  const [isRefining, setIsRefining] = useState(false)
  const [refineError, setRefineError] = useState<string | null>(null)
  const [generatedLink, setGeneratedLink] = useState<string | null>(null)
  const [mailStatus, setMailStatus] = useState<'sent' | 'skipped' | 'failed' | null>(null)
  const [driveLink, setDriveLink] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const refineNote = async () => {
    setRefineError(null)
    const note = personalNote.trim()
    if (!note) {
      setRefineError('כתוב משהו לפני שמדייקים')
      return
    }
    setIsRefining(true)
    try {
      const res = await fetch('/api/brief-note/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          note,
          clientName: clientName.trim() || undefined,
          language,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Refine failed')
      if (typeof data.refined === 'string' && data.refined.trim()) {
        setPersonalNote(data.refined.trim())
      } else {
        throw new Error('Empty refinement')
      }
    } catch (e) {
      setRefineError(e instanceof Error ? e.message : 'הדיוק נכשל')
    } finally {
      setIsRefining(false)
    }
  }

  const createLink = async () => {
    setErrorMsg(null)
    if (!clientName.trim()) {
      setErrorMsg('חובה להזין שם לקוח')
      return
    }
    setIsCreating(true)
    try {
      const res = await fetch('/api/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: docType.slug,
          client_name: clientName.trim(),
          client_email: clientEmail.trim() || null,
          personal_note: personalNote.trim() || null,
          metadata: { language },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setGeneratedLink(data.full_link)
      setMailStatus((data.mail_delivery as 'sent' | 'skipped' | 'failed' | undefined) ?? null)
      setDriveLink(
        (data.metadata?.brief_drive_folder_link as string | undefined) ||
          (data.drive_folder_id ? `https://drive.google.com/drive/folders/${data.drive_folder_id}` : null),
      )
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'שגיאה ביצירת הלינק')
    } finally {
      setIsCreating(false)
    }
  }

  const copyLink = async () => {
    if (!generatedLink) return
    await navigator.clipboard.writeText(generatedLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const reset = () => {
    setGeneratedLink(null)
    setMailStatus(null)
    setDriveLink(null)
    setClientName('')
    setClientEmail('')
    setPersonalNote('')
    setRefineError(null)
    setCopied(false)
  }

  return (
    <div dir="rtl" className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
          ← חזרה לדשבורד
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">שליחת {docType.name}</h1>
        {docType.description && <p className="text-muted-foreground">{docType.description}</p>}
      </div>

      {!generatedLink ? (
        <div className="bg-white border rounded-xl p-6 mb-10">
          <div className="mb-5">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              שם הלקוח <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="למשל: חברת ABC"
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-primary"
            />
          </div>

          <div className="mb-5">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              אימייל הלקוח
              <span className="text-xs text-gray-500 font-normal mr-2">(אופציונלי)</span>
            </label>
            <input
              type="email"
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
              placeholder="client@example.com"
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-primary"
              dir="ltr"
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">שפת הטופס</label>
            <div className="flex gap-2">
              {(['he', 'en'] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLanguage(l)}
                  className={`px-4 py-2 rounded-lg border-2 text-sm font-medium ${
                    language === l
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-gray-200 text-gray-600'
                  }`}
                >
                  {l === 'he' ? 'עברית' : 'English'}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-semibold text-gray-700">
                הערה אישית ללקוח
                <span className="text-xs text-gray-500 font-normal mr-2">(אופציונלי, נכנס לגוף המייל)</span>
              </label>
              <button
                type="button"
                onClick={refineNote}
                disabled={isRefining || !personalNote.trim()}
                className="text-xs font-semibold text-primary hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                title="דיוק לשוני עם AI"
              >
                {isRefining ? (
                  <>
                    <span className="inline-block w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    מדייק…
                  </>
                ) : (
                  <>✨ דיוק עם AI</>
                )}
              </button>
            </div>
            <textarea
              value={personalNote}
              onChange={(e) => setPersonalNote(e.target.value)}
              placeholder={language === 'he'
                ? 'למשל: היה תענוג להכיר בפגישה השבוע. השארתי לך את הבריף — נשמח לחזור אליך עם הצעת מחיר תוך 48 שעות אחרי שתמלא.'
                : 'e.g. Great meeting you this week. I\'ve left the brief for you — once you fill it in we\'ll come back with a proposal within 48 hours.'}
              rows={4}
              maxLength={2000}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-primary resize-y text-[14px] leading-relaxed"
              dir={language === 'he' ? 'rtl' : 'ltr'}
            />
            <div className="flex items-center justify-between mt-1.5">
              {refineError ? (
                <span className="text-xs text-red-600">{refineError}</span>
              ) : (
                <span className="text-xs text-gray-400">
                  כתוב טקסט חופשי וגע ב״דיוק עם AI״ כדי לעדן לפני שליחה.
                </span>
              )}
              <span className="text-[11px] text-gray-400 tabular-nums">
                {personalNote.length}/2000
              </span>
            </div>
          </div>

          {errorMsg && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
              {errorMsg}
            </div>
          )}

          <button
            onClick={createLink}
            disabled={isCreating}
            className="w-full px-6 py-3 bg-primary text-primary-foreground font-bold rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {isCreating ? 'יוצר לינק...' : 'צור לינק ייחודי'}
          </button>
        </div>
      ) : (
        <div className="bg-green-50 border-2 border-green-200 rounded-xl p-6 mb-10">
          <div className="text-center mb-4">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg
                className="w-7 h-7 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-green-900">הלינק נוצר</h2>
            <p className="text-sm text-green-700 mt-1">
              {mailStatus === 'sent'
                ? `נשלח אוטומטית ל-${clientEmail}`
                : `שתף אותו עם ${clientName}`}
            </p>
          </div>

          {/* Native pipeline status — Drive folder + email delivery */}
          {(driveLink || mailStatus) && (
            <div className="bg-white/60 border border-green-200 rounded-lg p-3 mb-3 text-xs space-y-1.5">
              {driveLink && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-green-900">📁 תיקיית בריף ב-Drive נוצרה</span>
                  <a
                    href={driveLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-green-700 underline font-semibold whitespace-nowrap"
                  >
                    פתח תיקייה
                  </a>
                </div>
              )}
              {mailStatus === 'sent' && (
                <div className="text-green-900">✉️ מייל נשלח ללקוח מתיבת הדוא״ל שלך</div>
              )}
              {mailStatus === 'skipped' && (
                <div className="text-amber-700">
                  ⚠ המייל לא נשלח אוטומטית — אין token של Gmail. העתק את הלינק ושלח ידנית.
                </div>
              )}
              {mailStatus === 'failed' && (
                <div className="text-red-700">
                  ✗ שליחת המייל נכשלה. הלינק זמין למטה — שלח ידנית.
                </div>
              )}
            </div>
          )}

          <div className="bg-white border rounded-lg p-3 text-xs md:text-sm break-all text-gray-700 mb-3" dir="ltr">
            {generatedLink}
          </div>

          <div className="flex flex-col md:flex-row gap-3">
            <button
              onClick={copyLink}
              className="flex-1 px-4 py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:opacity-90"
            >
              {copied ? '✓ הועתק' : 'העתק לינק'}
            </button>
            <button
              onClick={reset}
              className="flex-1 px-4 py-3 bg-white border-2 border-gray-300 text-gray-700 font-semibold rounded-lg hover:border-gray-400"
            >
              צור לינק נוסף
            </button>
          </div>
        </div>
      )}

      {/* Recent links */}
      <div className="bg-white border rounded-xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">לינקים שיצרת</h2>
          {docType.slug === 'client-brief' && (
            <Link
              href="/briefs"
              className="text-xs font-semibold text-primary hover:opacity-80"
            >
              כל הבריפים ←
            </Link>
          )}
        </div>
        {recentLinks.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">עדיין לא יצרת לינקים</p>
        ) : (
          <div className="space-y-2">
            {recentLinks.map((link) => {
              // Only completed client-brief links have something useful to show
              // on the dedicated /briefs/[token] page (full submission body).
              // For pending/opened links there's no submission yet, so we keep
              // the row non-clickable.
              const showBriefLink = docType.slug === 'client-brief' && link.status === 'completed'
              const inner = (
                <>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{link.client_name ?? '(ללא שם)'}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(link.created_at)}
                      {link.client_email ? ` · ${link.client_email}` : ''}
                    </p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColor(link.status)}`}>
                    {statusLabel(link.status)}
                  </span>
                </>
              )
              return showBriefLink ? (
                <Link
                  key={link.id}
                  href={`/briefs/${link.token}`}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {inner}
                </Link>
              ) : (
                <div
                  key={link.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  {inner}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
