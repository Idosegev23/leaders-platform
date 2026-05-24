'use client'

import { useEffect, useState } from 'react'

interface Props {
  open: boolean
  token: string
  clientName: string
  clientEmail: string | null
  language: 'he' | 'en'
  daysSinceSent: number
  onClose: () => void
  onSent: () => void
}

export default function ReminderDialog({
  open,
  token,
  clientName,
  clientEmail,
  language,
  daysSinceSent,
  onClose,
  onSent,
}: Props) {
  const [text, setText] = useState('')
  const [isRefining, setIsRefining] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setText(defaultText({ language, clientName, daysSinceSent }))
      setError(null)
    }
  }, [open, language, clientName, daysSinceSent])

  if (!open) return null

  const refine = async () => {
    setError(null)
    if (!text.trim()) {
      setError('כתוב משהו לפני שמדייקים')
      return
    }
    setIsRefining(true)
    try {
      const res = await fetch('/api/brief-note/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: text.trim(), clientName, language }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'refine failed')
      if (typeof data.refined === 'string' && data.refined.trim()) {
        setText(data.refined.trim())
      } else {
        throw new Error('empty refinement')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'הדיוק נכשל')
    } finally {
      setIsRefining(false)
    }
  }

  const send = async () => {
    setError(null)
    if (!text.trim()) {
      setError('הטקסט ריק')
      return
    }
    setIsSending(true)
    try {
      const res = await fetch(`/api/briefs/${token}/reminder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || data.error || 'שליחה נכשלה')
      onSent()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שליחה נכשלה')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-primary/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white max-w-lg w-full rounded-sm ring-1 ring-brand-primary/15 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-brand-primary/10">
          <p className="text-[10px] tracking-[0.32em] uppercase text-brand-primary/55 font-rubik font-medium mb-2">
            תזכורת ללקוח
          </p>
          <h2 className="text-[20px] font-semibold text-brand-primary leading-tight">
            {clientName || '(ללא שם)'}
          </h2>
          {clientEmail && (
            <p className="mt-1 text-[12px] text-brand-primary/65" dir="ltr">
              {clientEmail}
            </p>
          )}
        </div>

        <div className="p-6">
          <div className="flex items-center justify-between mb-2">
            <label className="text-[12px] tracking-[0.04em] font-medium text-brand-primary/75">
              גוף ההודעה
            </label>
            <button
              type="button"
              onClick={refine}
              disabled={isRefining || !text.trim()}
              className="text-[11px] font-semibold text-brand-accent hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {isRefining ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-brand-accent border-t-transparent rounded-full animate-spin" />
                  מדייק…
                </>
              ) : (
                <>✨ דיוק עם AI</>
              )}
            </button>
          </div>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={8}
            maxLength={2000}
            dir={language === 'en' ? 'ltr' : 'rtl'}
            className="w-full px-3 py-2.5 border border-brand-primary/15 rounded-sm focus:outline-none focus:border-brand-primary/40 text-[14px] leading-relaxed resize-y"
          />
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-[11px] text-brand-primary/45">
              נשלח דרך תיבת הדוא״ל של השולח המקורי. cooldown: 72ש' בין תזכורות.
            </span>
            <span className="text-[11px] text-brand-primary/45 tabular-nums">
              {text.length}/2000
            </span>
          </div>

          {error && (
            <div className="mt-3 p-2.5 bg-red-50 border border-red-200 text-red-700 text-[12px] rounded-sm">
              {error}
            </div>
          )}
        </div>

        <div className="p-5 border-t border-brand-primary/10 flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isSending}
            className="px-4 py-2 rounded-sm border border-brand-primary/15 text-[13px] font-medium text-brand-primary/70 hover:border-brand-primary/35 disabled:opacity-50"
          >
            ביטול
          </button>
          <button
            type="button"
            onClick={send}
            disabled={isSending || !text.trim()}
            className="px-5 py-2 rounded-sm bg-brand-primary text-brand-ivory text-[13px] font-semibold hover:bg-brand-primary/85 disabled:opacity-50"
          >
            {isSending ? 'שולח…' : 'שלח תזכורת'}
          </button>
        </div>
      </div>
    </div>
  )
}

function defaultText({
  language,
  clientName,
  daysSinceSent,
}: {
  language: 'he' | 'en'
  clientName: string
  daysSinceSent: number
}): string {
  if (language === 'en') {
    return `Hi${clientName ? ' ' + clientName : ''},

Just a soft nudge — I sent over the brief about ${daysSinceSent} day${daysSinceSent === 1 ? '' : 's'} ago and we're holding a slot to get started as soon as you submit. It only takes ~15 minutes, and your answers save as you go.

Happy to jump on a quick call if anything's unclear.`
  }
  return `היי${clientName ? ' ' + clientName : ''},

רציתי להזכיר בעדינות — שלחתי את הבריף לפני כ-${daysSinceSent} ימים ושמרנו לך מקום להתחיל מיד אחרי המילוי. זה לוקח כ-15 דקות, ומה שמילאת נשמר אוטומטית.

אם משהו לא ברור, אשמח לקפוץ על שיחה קצרה.`
}
