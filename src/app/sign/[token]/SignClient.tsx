'use client'

import { useEffect, useRef, useState } from 'react'

type Props = {
  token: string
  title: string
  status: 'pending' | 'opened' | 'signed' | 'expired' | 'cancelled'
  recipientEmail: string
  recipientName: string | null
  pdfViewLink: string | null
  signedPdfViewLink: string | null
  signedAt: string | null
  signerName: string | null
  senderName: string
}

export default function SignClient(props: Props) {
  const [signerName, setSignerName] = useState(props.recipientName ?? '')
  const [signerEmail, setSignerEmail] = useState(props.recipientEmail ?? '')
  const [signerRole, setSignerRole] = useState('')
  const [signerNotes, setSignerNotes] = useState('')
  const [signerIdNumber, setSignerIdNumber] = useState('')
  const [signerCompany, setSignerCompany] = useState('')
  const [signerCompanyHp, setSignerCompanyHp] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [mode, setMode] = useState<'draw' | 'type'>('draw')
  const [typedName, setTypedName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ signed_at: string; drive_link: string } | null>(null)

  if (props.status === 'signed') {
    return <AlreadySigned {...props} />
  }
  if (props.status === 'expired' || props.status === 'cancelled') {
    return <Expired status={props.status} />
  }

  if (done) {
    return <ThankYou title={props.title} signedAt={done.signed_at} driveLink={done.drive_link} />
  }

  const submit = async () => {
    setError(null)

    if (!signerName.trim()) {
      setError('יש להזין שם מלא')
      return
    }
    if (!agreed) {
      setError('יש לאשר את ההצעה ואת תנאיה לפני החתימה')
      return
    }

    let signatureImage: string | null = null
    let typed: string | null = null

    if (mode === 'draw') {
      signatureImage = canvasGetDataUrl()
      if (!signatureImage) {
        setError('יש לחתום בתיבה לפני השליחה')
        return
      }
    } else {
      typed = typedName.trim()
      if (!typed) {
        setError('יש להקליד את השם בכתב יד')
        return
      }
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/signatures/${props.token}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signer_name: signerName.trim(),
          signer_email: signerEmail.trim() || null,
          signer_role: signerRole.trim() || null,
          signer_notes: signerNotes.trim() || null,
          signer_id_number: signerIdNumber.trim() || null,
          signer_company: signerCompany.trim() || null,
          signer_company_hp: signerCompanyHp.trim() || null,
          signature_image: signatureImage,
          typed_name: typed,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `HTTP ${res.status}`)
      }
      const j = (await res.json()) as { signed_at: string; drive_link: string }
      setDone(j)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div dir="rtl" className="min-h-screen bg-brand-pearl text-brand-primary font-heebo">
      {/* Header */}
      <header className="border-b border-brand-primary/10 bg-brand-ivory/80 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between">
          <span className="text-lg font-bold tracking-[0.04em]">Leaders</span>
          <span className="text-[10px] tracking-[0.36em] uppercase text-brand-primary/55 font-rubik font-medium">
            Document for signature
          </span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10 md:py-14">
        <p className="text-[10px] tracking-[0.5em] uppercase text-brand-primary/55 font-rubik mb-5 font-medium">
          Leaders × OS · חתימת לקוח
        </p>
        <h1 className="text-[34px] md:text-[44px] leading-[1.05] font-bold tracking-tight">
          {props.title}
        </h1>
        <p className="mt-3 text-[14px] text-brand-primary/65 max-w-xl leading-relaxed">
          {props.senderName} מ־Leaders שלח את המסמך הזה לעיון וחתימה.
          לאחר אישורך, עותק חתום יישלח אליך וגם יישמר במערכת.
        </p>

        {/* PDF preview */}
        <section className="mt-10 rounded-sm ring-1 ring-brand-primary/10 bg-brand-ivory overflow-hidden">
          <div className="px-5 py-3 flex items-center justify-between border-b border-brand-primary/10">
            <span className="text-[10px] tracking-[0.32em] uppercase text-brand-primary/55 font-rubik font-medium">
              צפייה במסמך
            </span>
            {props.pdfViewLink && (
              <a
                href={props.pdfViewLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[12px] text-brand-primary/65 hover:text-brand-accent transition-colors font-medium"
              >
                פתח ב־Drive ↗
              </a>
            )}
          </div>
          {props.pdfViewLink ? (
            <iframe
              src={props.pdfViewLink.replace('/view?', '/preview?').replace('/view', '/preview')}
              className="w-full h-[55vh] bg-white"
              title={props.title}
            />
          ) : (
            <div className="p-10 text-center text-brand-primary/55 text-sm">המסמך לא זמין לתצוגה.</div>
          )}
        </section>

        {/* Form */}
        <section className="mt-10 grid gap-5">
          <Field label="שם מלא · כפי שיופיע על המסמך החתום *">
            <input
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              className="w-full bg-brand-ivory ring-1 ring-brand-primary/15 focus:ring-brand-primary/45 rounded-sm px-4 py-3 text-[15px] text-brand-primary outline-none transition-colors"
            />
          </Field>

          <div className="grid md:grid-cols-2 gap-5">
            <Field label="מייל">
              <input
                type="email"
                value={signerEmail}
                onChange={(e) => setSignerEmail(e.target.value)}
                className="w-full bg-brand-ivory ring-1 ring-brand-primary/15 focus:ring-brand-primary/45 rounded-sm px-4 py-3 text-[15px] text-brand-primary outline-none transition-colors"
              />
            </Field>
            <Field label="תפקיד">
              <input
                value={signerRole}
                onChange={(e) => setSignerRole(e.target.value)}
                placeholder="לדוגמה: מנכ״ל / מנהלת שיווק"
                className="w-full bg-brand-ivory ring-1 ring-brand-primary/15 focus:ring-brand-primary/45 rounded-sm px-4 py-3 text-[15px] text-brand-primary outline-none placeholder:text-brand-primary/35 transition-colors"
              />
            </Field>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            <Field label="ת.ז.">
              <input
                value={signerIdNumber}
                onChange={(e) => setSignerIdNumber(e.target.value)}
                inputMode="numeric"
                className="w-full bg-brand-ivory ring-1 ring-brand-primary/15 focus:ring-brand-primary/45 rounded-sm px-4 py-3 text-[15px] text-brand-primary outline-none transition-colors ltr-input"
                dir="ltr"
              />
            </Field>
            <Field label="שם החברה">
              <input
                value={signerCompany}
                onChange={(e) => setSignerCompany(e.target.value)}
                className="w-full bg-brand-ivory ring-1 ring-brand-primary/15 focus:ring-brand-primary/45 rounded-sm px-4 py-3 text-[15px] text-brand-primary outline-none transition-colors"
              />
            </Field>
            <Field label="ח.פ.">
              <input
                value={signerCompanyHp}
                onChange={(e) => setSignerCompanyHp(e.target.value)}
                inputMode="numeric"
                className="w-full bg-brand-ivory ring-1 ring-brand-primary/15 focus:ring-brand-primary/45 rounded-sm px-4 py-3 text-[15px] text-brand-primary outline-none transition-colors ltr-input"
                dir="ltr"
              />
            </Field>
          </div>

          <Field label="הערות (לא חובה)">
            <textarea
              rows={3}
              value={signerNotes}
              onChange={(e) => setSignerNotes(e.target.value)}
              placeholder="כל הערה שהיית רוצה לצרף לחתימה"
              className="w-full bg-brand-ivory ring-1 ring-brand-primary/15 focus:ring-brand-primary/45 rounded-sm px-4 py-3 text-[15px] text-brand-primary outline-none placeholder:text-brand-primary/35 transition-colors leading-relaxed"
            />
          </Field>

          {/* Signature box */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] tracking-[0.32em] uppercase text-brand-primary/55 font-rubik font-medium">
                חתימה *
              </span>
              <div className="flex items-center gap-2 text-[11px] font-rubik tracking-[0.04em] font-medium">
                <button
                  type="button"
                  onClick={() => setMode('draw')}
                  className={`px-3 py-1 rounded-full ring-1 transition-colors ${mode === 'draw' ? 'bg-brand-primary text-brand-ivory ring-brand-primary' : 'bg-brand-ivory ring-brand-primary/15 text-brand-primary/65 hover:text-brand-primary'}`}
                >
                  ציור
                </button>
                <button
                  type="button"
                  onClick={() => setMode('type')}
                  className={`px-3 py-1 rounded-full ring-1 transition-colors ${mode === 'type' ? 'bg-brand-primary text-brand-ivory ring-brand-primary' : 'bg-brand-ivory ring-brand-primary/15 text-brand-primary/65 hover:text-brand-primary'}`}
                >
                  הקלדה
                </button>
              </div>
            </div>

            {mode === 'draw' ? <SignaturePad /> : (
              <div>
                <input
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  placeholder="הקלד את שמך כאן"
                  className="w-full bg-white text-brand-primary rounded-sm px-5 py-6 text-[28px] font-medium text-center outline-none ring-1 ring-brand-primary/15"
                />
                <p className="mt-2 text-[11px] text-brand-primary/55 font-rubik tracking-[0.04em] font-medium">
                  השם המוקלד ייראה כחתימה במסמך.
                </p>
              </div>
            )}
          </div>

          {/* Confirmation checkbox */}
          <label className="flex items-start gap-3 mt-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1 h-4 w-4 accent-brand-accent"
            />
            <span className="text-[14px] text-brand-primary/80 leading-relaxed">
              אני מאשר את ההצעה ואת תנאיה ומסכים שהחתימה תופיע במסמך החתום.
            </span>
          </label>

          {error && (
            <div className="rounded-sm ring-1 ring-red-500/30 bg-red-50 px-4 py-3 text-[13px] text-red-700">
              {error}
            </div>
          )}

          <button
            type="button"
            disabled={submitting}
            onClick={submit}
            className="mt-2 inline-flex items-center justify-center gap-3 rounded-full bg-brand-primary text-brand-ivory py-4 text-[15px] font-semibold tracking-[0.04em] transition-all duration-300 hover:bg-brand-accent disabled:opacity-50"
          >
            {submitting ? 'שולח חתימה…' : 'חתום ושלח ←'}
          </button>
        </section>
      </main>

      <footer className="text-center pb-10 pt-4 text-[10px] tracking-[0.32em] uppercase text-brand-primary/35 font-rubik font-medium">
        Leaders × OS · Internal signing
      </footer>
    </div>
  )
}

/* ---------------------------------------------------------------- */
/* Signature canvas                                                 */
/* ---------------------------------------------------------------- */

function SignaturePad() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const lastRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = canvas.clientWidth * dpr
    canvas.height = canvas.clientHeight * dpr
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#1a1a2e'
    ctx.lineWidth = 2.4
  }, [])

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drawingRef.current = true
    lastRef.current = pos(e)
  }
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const p = pos(e)
    const last = lastRef.current ?? p
    ctx.beginPath()
    ctx.moveTo(last.x, last.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    lastRef.current = p
  }
  const end = () => {
    drawingRef.current = false
    lastRef.current = null
  }

  const clear = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight)
  }

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        className="block w-full h-44 md:h-52 bg-white rounded-sm ring-1 ring-brand-primary/15 cursor-crosshair touch-none"
      />
      <button
        type="button"
        onClick={clear}
        className="absolute top-3 end-3 text-[10px] tracking-[0.24em] uppercase text-brand-primary/55 hover:text-brand-primary font-rubik font-medium"
      >
        נקה
      </button>
    </div>
  )
}

function canvasGetDataUrl(): string | null {
  const canvas = document.querySelector<HTMLCanvasElement>('canvas')
  if (!canvas) return null
  const ctx = canvas.getContext('2d')!
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  let hasInk = false
  for (let i = 0; i < data.length; i += 40 * 4) {
    if (data[i] < 240 || data[i + 1] < 240 || data[i + 2] < 240) {
      hasInk = true
      break
    }
  }
  if (!hasInk) return null
  return canvas.toDataURL('image/png')
}

/* ---------------------------------------------------------------- */
/* Field wrapper                                                    */
/* ---------------------------------------------------------------- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] tracking-[0.32em] uppercase text-brand-primary/55 font-rubik mb-2 font-medium">
        {label}
      </span>
      {children}
    </label>
  )
}

/* ---------------------------------------------------------------- */
/* Terminal states                                                  */
/* ---------------------------------------------------------------- */

function ThankYou({ title, signedAt, driveLink }: { title: string; signedAt: string; driveLink: string }) {
  return (
    <div dir="rtl" className="min-h-screen bg-brand-pearl text-brand-primary font-heebo flex items-center justify-center px-6">
      <div className="max-w-lg text-center">
        <p className="text-[10px] tracking-[0.5em] uppercase text-brand-primary/55 font-rubik mb-5 font-medium">Leaders × OS</p>
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-brand-accent/10 ring-1 ring-brand-accent mb-6">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-brand-accent">
            <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h1 className="text-[34px] md:text-[40px] font-bold tracking-tight mb-3">החתימה התקבלה.</h1>
        <p className="text-[14px] text-brand-primary/70 leading-relaxed">
          תודה. עותק חתום של "{title}" נשלח אליך במייל. גם הצוות בלידרס קיבל הודעה.
        </p>
        <a
          href={driveLink}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-10 inline-flex items-center gap-2 rounded-full bg-brand-primary text-brand-ivory px-8 py-3 text-[14px] font-semibold tracking-[0.04em] hover:bg-brand-accent transition-colors"
        >
          צפה במסמך החתום ←
        </a>
        <p className="mt-8 text-[10px] tracking-[0.24em] uppercase text-brand-primary/45 font-rubik font-medium">
          נחתם: {new Date(signedAt).toLocaleString('he-IL')}
        </p>
      </div>
    </div>
  )
}

function AlreadySigned(props: Props) {
  return (
    <div dir="rtl" className="min-h-screen bg-brand-pearl text-brand-primary font-heebo flex items-center justify-center px-6">
      <div className="max-w-lg text-center">
        <p className="text-[10px] tracking-[0.5em] uppercase text-brand-primary/55 font-rubik mb-5 font-medium">Leaders × OS</p>
        <h1 className="text-[34px] font-bold tracking-tight mb-3">המסמך כבר נחתם.</h1>
        <p className="text-[14px] text-brand-primary/70 leading-relaxed">
          {props.signerName ?? 'המסמך'} נחתם
          {props.signedAt ? ` ב־${new Date(props.signedAt).toLocaleString('he-IL')}` : ''}.
        </p>
        {props.signedPdfViewLink && (
          <a
            href={props.signedPdfViewLink}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-10 inline-flex items-center gap-2 rounded-full bg-brand-primary text-brand-ivory px-8 py-3 text-[14px] font-semibold hover:bg-brand-accent transition-colors"
          >
            צפה בעותק החתום ←
          </a>
        )}
      </div>
    </div>
  )
}

function Expired({ status }: { status: 'expired' | 'cancelled' }) {
  const text = status === 'expired' ? 'בקשת החתימה פגה תוקף.' : 'בקשת החתימה בוטלה.'
  return (
    <div dir="rtl" className="min-h-screen bg-brand-pearl text-brand-primary font-heebo flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <p className="text-[10px] tracking-[0.5em] uppercase text-brand-primary/55 font-rubik mb-5 font-medium">Leaders × OS</p>
        <h1 className="text-[28px] font-bold tracking-tight mb-3">{text}</h1>
        <p className="text-[13px] text-brand-primary/65">
          פנה ליוצר ההצעה במייל לקבלת קישור חדש.
        </p>
      </div>
    </div>
  )
}
