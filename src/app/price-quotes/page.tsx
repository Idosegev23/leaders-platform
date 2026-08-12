/**
 * /price-quotes — the "my quotes" list. Every persisted quote, newest first,
 * each linking into the editor at /price-quote?id=<id>. Read-only server render.
 */
import Link from 'next/link'
import { priceQuoteService } from '@/lib/price-quotes/service'

export const dynamic = 'force-dynamic'

type Row = {
  id: string
  quote_number: string
  title: string
  client_name: string
  campaign_name: string
  draft_updated_at: string
  owner_email: string
  published_count: number
  archived_at: string | null
}

function stateLabel(r: Row, signed: boolean): { text: string; cls: string } {
  if (r.archived_at) return { text: 'ארכיון', cls: 'bg-gray-100 text-gray-500' }
  if (signed) return { text: 'נחתם', cls: 'bg-emerald-50 text-emerald-700' }
  if (r.published_count > 0) return { text: 'נשלח', cls: 'bg-blue-50 text-blue-700' }
  return { text: 'טיוטה', cls: 'bg-amber-50 text-amber-700' }
}

export default async function PriceQuotesListPage() {
  const svc = priceQuoteService()

  const { data: quotes } = await svc
    .from('price_quotes')
    .select('id, quote_number, title, client_name, campaign_name, draft_updated_at, owner_email, published_count, archived_at')
    .order('draft_updated_at', { ascending: false })
    .limit(300)

  const rows = (quotes ?? []) as Row[]

  // One query for signed-state across all listed quotes.
  const { data: signedReqs } = await svc
    .from('signature_requests')
    .select('status, price_quote_revisions!inner(quote_id)')
    .eq('status', 'signed')
  const signedQuoteIds = new Set(
    ((signedReqs ?? []) as Array<{ price_quote_revisions: { quote_id: string }[] | { quote_id: string } | null }>)
      .flatMap((r) => {
        const rel = r.price_quote_revisions
        if (!rel) return []
        return Array.isArray(rel) ? rel.map((x) => x.quote_id) : [rel.quote_id]
      })
      .filter(Boolean),
  )

  return (
    <div className="max-w-5xl mx-auto px-6 py-8" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">הצעות מחיר</h1>
        <Link
          href="/price-quote"
          className="px-4 py-2 bg-gray-900 text-white rounded-full text-sm font-medium hover:bg-gray-700"
        >
          + הצעה חדשה
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="text-gray-400 text-sm">אין עדיין הצעות שמורות.</p>
      ) : (
        <div className="overflow-x-auto border border-gray-100 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-right">
              <tr>
                <th className="px-4 py-3 font-medium">מספר</th>
                <th className="px-4 py-3 font-medium">לקוח</th>
                <th className="px-4 py-3 font-medium">קמפיין</th>
                <th className="px-4 py-3 font-medium">סטטוס</th>
                <th className="px-4 py-3 font-medium">עודכן</th>
                <th className="px-4 py-3 font-medium">בעלים</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const s = stateLabel(r, signedQuoteIds.has(r.id))
                return (
                  <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={`/price-quote?id=${r.id}`} className="text-gray-900 font-medium hover:underline">
                        {r.quote_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{r.client_name || '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{r.campaign_name || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${s.cls}`}>{s.text}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(r.draft_updated_at).toLocaleDateString('he-IL')}
                    </td>
                    <td className="px-4 py-3 text-gray-400">{r.owner_email}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
