'use client'

import { useState, useEffect } from 'react'

type Props = {
  open: boolean
  onClose: () => void
  defaultTitle: string
  generatePdfBase64: () => Promise<string>     // produces base64 of the PDF
}

const FOLDER_STORAGE_KEY = 'leaders.lastDriveFolder'

export function SendForSignatureDialog({ open, onClose, defaultTitle, generatePdfBase64 }: Props) {
  const [recipientName, setRecipientName] = useState('')
  const [recipientEmail, setRecipientEmail] = useState('')
  const [driveFolder, setDriveFolder] = useState('')
  const [title, setTitle] = useState(defaultTitle)
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ sign_link: string; drive_link: string } | null>(null)

  useEffect(() => { setTitle(defaultTitle) }, [defaultTitle])
  useEffect(() => {
    if (open) {
      const last = typeof window !== 'undefined' ? localStorage.getItem(FOLDER_STORAGE_KEY) : null
      if (last) setDriveFolder(last)
    } else {
      setError(null)
      setSuccess(null)
    }
  }, [open])

  if (!open) return null

  const submit = async () => {
    setError(null)
    if (!recipientEmail.trim()) { setError('יש להזין מייל הנמען'); return }
    if (!driveFolder.trim())     { setError('יש להזין תיקיה ב-Drive'); return }
    if (!title.trim())           { setError('יש להזין כותרת למסמך'); return }

    setSubmitting(true)
    try {
      const pdfBase64 = await generatePdfBase64()
      const res = await fetch('/api/quotes/request-signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          recipient_email: recipientEmail.trim(),
          recipient_name: recipientName.trim() || null,
          drive_folder: driveFolder.trim(),
          pdf_base64: pdfBase64,
          message: message.trim() || null,
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setSuccess({ sign_link: j.sign_link, drive_link: j.drive_link })
      try { localStorage.setItem(FOLDER_STORAGE_KEY, driveFolder.trim()) } catch {}
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-[#0a0a0f] text-white border border-white/10 rounded-sm shadow-2xl overflow-hidden font-heebo"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-6 py-5 border-b border-white/10 flex items-center justify-between">
          <div>
            <p className="text-[10px] tracking-[0.4em] uppercase text-white/40 font-rubik">Leaders × OS</p>
            <h2 className="mt-1 text-[20px] font-medium">שליחה לחתימה</h2>
          </div>
          <button
            onClick={onClose}
            className="text-white/45 hover:text-white text-xl leading-none"
            aria-label="close"
          >
            ✕
          </button>
        </header>

        {success ? (
          <div className="p-6 space-y-4">
            <div className="rounded-sm ring-1 ring-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-[14px] text-emerald-200">
              נשלח! המייל יצא לנמען. עותק ה-PDF נשמר ב-Drive.
            </div>
            <div className="space-y-2 text-[13px]">
              <div>
                <span className="text-white/45 text-[10px] tracking-[0.32em] uppercase font-rubik block mb-1">קישור לחתימה</span>
                <a href={success.sign_link} target="_blank" rel="noopener noreferrer" className="text-brand-accent break-all hover:underline">
                  {success.sign_link}
                </a>
              </div>
              <div>
                <span className="text-white/45 text-[10px] tracking-[0.32em] uppercase font-rubik block mb-1">PDF ב-Drive</span>
                <a href={success.drive_link} target="_blank" rel="noopener noreferrer" className="text-white/70 break-all hover:text-white">
                  {success.drive_link}
                </a>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-full mt-4 rounded-full bg-white text-[#0a0a0f] py-3 font-medium hover:bg-brand-accent hover:text-white transition-colors"
            >
              סגור
            </button>
          </div>
        ) : (
          <div className="p-6 space-y-4">
            <Field label="כותרת המסמך *">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-white/[0.04] ring-1 ring-white/15 focus:ring-white/35 rounded-sm px-3 py-2.5 text-[14px] outline-none transition-colors"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="שם הנמען">
                <input
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  className="w-full bg-white/[0.04] ring-1 ring-white/15 focus:ring-white/35 rounded-sm px-3 py-2.5 text-[14px] outline-none"
                />
              </Field>
              <Field label="מייל הנמען *">
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  className="w-full bg-white/[0.04] ring-1 ring-white/15 focus:ring-white/35 rounded-sm px-3 py-2.5 text-[14px] outline-none"
                />
              </Field>
            </div>

            <Field label="תיקיית Drive לשמירה * (קישור או ID)">
              <input
                value={driveFolder}
                onChange={(e) => setDriveFolder(e.target.value)}
                placeholder="https://drive.google.com/drive/folders/..."
                className="w-full bg-white/[0.04] ring-1 ring-white/15 focus:ring-white/35 rounded-sm px-3 py-2.5 text-[13px] outline-none placeholder:text-white/25 ltr-input"
                dir="ltr"
              />
              <p className="mt-2 text-[10px] tracking-[0.18em] uppercase text-white/35 font-rubik leading-relaxed">
                ⓘ ודא שהתיקיה משותפת עם <span className="ltr-input inline-block">ldrsagent@ldrsgroup-484815.iam.gserviceaccount.com</span> כעורך.
              </p>
            </Field>

            <Field label="הודעה אישית (לא חובה)">
              <textarea
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="לדוגמה: ההצעה צמודת תוצאות, שמח לעבור איתך עליה במייל חוזר."
                className="w-full bg-white/[0.04] ring-1 ring-white/15 focus:ring-white/35 rounded-sm px-3 py-2.5 text-[13px] outline-none placeholder:text-white/25 leading-relaxed"
              />
            </Field>

            {error && (
              <div className="rounded-sm ring-1 ring-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
                {error}
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={onClose}
                className="px-5 py-2.5 text-[13px] text-white/55 hover:text-white transition-colors"
              >
                ביטול
              </button>
              <button
                onClick={submit}
                disabled={submitting}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-white text-[#0a0a0f] py-3 text-[14px] font-medium hover:bg-brand-accent hover:text-white transition-colors disabled:opacity-50"
              >
                {submitting ? 'מעלה ל-Drive ושולח…' : 'שלח לחתימה ←'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] tracking-[0.32em] uppercase text-white/45 font-rubik mb-2">{label}</span>
      {children}
    </label>
  )
}
