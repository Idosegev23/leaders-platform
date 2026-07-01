'use client'

import { useEffect, useState } from 'react'

type Contract = {
  id: string
  token: string
  title: string
  recipient_name: string | null
  recipient_email: string | null
  status: string
  signed_at: string | null
  sign_url: string
  drive_link: string | null
  signed_link: string | null
  handle: string | null
}

export default function InfluencerContractsClient({
  quoteId,
  quoteTitle,
  quoteStatus,
  clientName,
  deckId,
}: {
  quoteId: string
  quoteTitle: string
  quoteStatus: string
  clientName: string
  deckId: string | null
}) {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deckInput, setDeckInput] = useState(deckId ?? '')

  async function load() {
    const res = await fetch(`/api/quotes/${quoteId}/influencer-contracts`)
    const json = await res.json()
    if (json.ok) setContracts(json.contracts)
  }
  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function generate() {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/quotes/${quoteId}/influencer-contracts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(deckInput ? { deck_document_id: deckInput } : {}),
      })
      const json = await res.json()
      if (!json.ok) { setError(json.error ?? 'נכשל'); return }
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setLoading(false)
    }
  }

  const signedQuote = quoteStatus === 'signed'

  return (
    <div dir="rtl" className="max-w-3xl mx-auto p-6">
      <div className="mb-6">
        <div className="text-xs tracking-widest uppercase text-[#c9a227] font-semibold">
          Leaders · חוזי משפיעניות
        </div>
        <h1 className="text-2xl font-bold text-[#1a1a2e] mt-1">{quoteTitle}</h1>
        <p className="text-sm text-[#1a1a2e]/60 mt-1">
          {clientName ? `לקוח: ${clientName} · ` : ''}
          סטטוס הצעת מחיר:{' '}
          <span className={signedQuote ? 'text-green-600 font-semibold' : 'text-red-500 font-semibold'}>
            {signedQuote ? 'נחתמה' : 'טרם נחתמה'}
          </span>
        </p>
      </div>

      {!signedQuote && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm p-4 mb-5">
          ניתן ליצור חוזי משפיעניות רק לאחר שהלקוח חתם על הצעת המחיר.
        </div>
      )}

      {signedQuote && (
        <div className="rounded-xl border border-[#ececf4] bg-white p-5 mb-6">
          {!deckId && (
            <label className="block mb-3 text-sm">
              <span className="text-[#1a1a2e]/70">מזהה מצגת (deck) עם רשימת המשפיעניות:</span>
              <input
                value={deckInput}
                onChange={(e) => setDeckInput(e.target.value)}
                placeholder="documents.id של המצגת"
                className="mt-1 w-full rounded-md border border-[#d9d9e3] px-3 py-2 text-sm"
              />
            </label>
          )}
          <button
            onClick={generate}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-full bg-[#1a1a2e] text-white text-sm font-semibold px-6 py-3 disabled:opacity-50"
          >
            {loading ? 'מייצר…' : 'צור חוזי משפיעניות'}
          </button>
          {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
        </div>
      )}

      {contracts.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-[#1a1a2e]/70">
            חוזים ({contracts.length})
          </h2>
          {contracts.map((c) => (
            <div key={c.id} className="rounded-lg border border-[#ececf4] bg-white p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold text-[#1a1a2e] truncate">
                  {c.recipient_name ?? c.handle ?? c.title}
                </div>
                <div className="text-xs text-[#1a1a2e]/55 mt-0.5">
                  סטטוס: {statusHe(c.status)}
                  {c.signed_at ? ` · נחתם ${new Date(c.signed_at).toLocaleDateString('he-IL')}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a href={c.sign_url} target="_blank" rel="noreferrer"
                   className="text-xs font-semibold text-[#e94560] underline">
                  קישור חתימה ←
                </a>
                {c.drive_link && (
                  <a href={c.drive_link} target="_blank" rel="noreferrer"
                     className="text-xs text-[#1a1a2e]/60 underline">PDF</a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function statusHe(s: string): string {
  switch (s) {
    case 'pending': return 'ממתין'
    case 'opened': return 'נצפה'
    case 'signed': return 'נחתם'
    case 'expired': return 'פג תוקף'
    case 'cancelled': return 'בוטל'
    default: return s
  }
}
