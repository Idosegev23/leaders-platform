import Link from 'next/link'
import { getCreator } from '@/lib/campaigns/services/creators'
import { StatusBadge, Panel } from '@/components/campaigns/ui'
import { formatMoney, parseMoney } from '@/lib/campaigns/domain/money'
import { heStatus } from '@/lib/campaigns/domain/state-machines'
import { load, pageCtx } from '../../_server'

export const dynamic = 'force-dynamic'

export default async function CreatorPage({ params }: { params: { cid: string } }) {
  const ctx = await pageCtx()
  const c = await load(() => getCreator(ctx, params.cid))
  return (
    <div className="space-y-4">
      <Link href="/campaigns/creators" className="text-xs text-wizard-text-secondary hover:underline">← למאגר</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{c.display_name}</h1>
        <StatusBadge status={c.status === 'active' ? 'active' : c.status === 'blocked' ? 'dead' : 'withdrawn'} label={c.status === 'active' ? 'פעיל' : c.status === 'blocked' ? 'חסום' : 'לא פעיל'} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="פרטים">
          <dl className="grid grid-cols-3 gap-y-1.5 text-sm">
            <dt className="text-wizard-text-secondary">דוא״ל</dt><dd className="col-span-2" dir="ltr">{c.email ?? '—'}</dd>
            <dt className="text-wizard-text-secondary">טלפון</dt><dd className="col-span-2" dir="ltr">{c.phone ?? '—'}</dd>
            <dt className="text-wizard-text-secondary">סוכנות</dt><dd className="col-span-2">{c.agency_name ?? 'עצמאי/ת'}</dd>
            <dt className="text-wizard-text-secondary">סוכנים</dt><dd className="col-span-2">{(c.agents as { display_name: string }[]).map((a) => a.display_name).join(', ') || '—'}</dd>
            <dt className="text-wizard-text-secondary">קטגוריות</dt><dd className="col-span-2">{c.categories.join(', ') || '—'}</dd>
            <dt className="text-wizard-text-secondary">הערות</dt><dd className="col-span-2 whitespace-pre-wrap">{c.internal_notes ?? '—'}</dd>
          </dl>
          {(c.accounts as { id: string; platform: string; handle: string; profile_url: string | null; follower_count: number | null }[]).length > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {(c.accounts as { id: string; platform: string; handle: string; profile_url: string | null; follower_count: number | null }[]).map((a) => (
                <li key={a.id}>{a.platform}: {a.profile_url ? <a className="text-brand-primary underline" href={a.profile_url} target="_blank" rel="noreferrer noopener" dir="ltr">@{a.handle}</a> : <span dir="ltr">@{a.handle}</span>}{a.follower_count ? ` · ${a.follower_count.toLocaleString('he-IL')} עוקבים` : ''}</li>
              ))}
            </ul>
          )}
          {(c.external_references as { system: string; external_type: string; external_id: string }[]).map((r, i) => (
            <p key={i} className="mt-1 text-xs text-wizard-text-secondary">קישור ידני ל-{r.system} ({r.external_type}): <span dir="ltr">{r.external_id}</span> · לא מסונכרן אוטומטית</p>
          ))}
        </Panel>
        <Panel title="היסטוריית השתתפויות (בקמפיינים שיש לך גישה אליהם)">
          {(c.history as { participation_id: string; campaign_id: string; campaign_name: string; selection_status: string; participation_status: string; agreed_fee: string | null; currency: string }[]).length === 0 ? <p className="text-sm text-wizard-text-secondary">אין השתתפויות</p> : (
            <ul className="divide-y divide-wizard-border text-sm">
              {(c.history as { participation_id: string; campaign_id: string; campaign_name: string; selection_status: string; participation_status: string; agreed_fee: string | null; currency: string }[]).map((h) => (
                <li key={h.participation_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link className="text-brand-primary underline" href={`/campaigns/${h.campaign_id}?tab=creators`}>{h.campaign_name}</Link>
                  <span className="text-xs">{heStatus(h.selection_status)} · {heStatus(h.participation_status)} · {formatMoney(parseMoney(h.agreed_fee), h.currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}
