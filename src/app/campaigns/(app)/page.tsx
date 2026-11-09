import Link from 'next/link'
import { listCampaigns, listStaff } from '@/lib/campaigns/services/campaigns'
import { canCreateCampaigns } from '@/lib/campaigns/auth/policy'
import { formatDate } from '@/lib/campaigns/domain/time'
import { formatMoney, parseMoney } from '@/lib/campaigns/domain/money'
import { CAMPAIGN_STATUSES, heStatus } from '@/lib/campaigns/domain/state-machines'
import { StatusBadge, Empty } from '@/components/campaigns/ui'
import { load, pageCtx } from './_server'

export const dynamic = 'force-dynamic'

export default async function CampaignsPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const ctx = await pageCtx()
  const clean = Object.fromEntries(Object.entries(searchParams).filter(([, v]) => v))
  const [data, staff] = await Promise.all([load(() => listCampaigns(ctx, clean)), listStaff(ctx)])
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize))
  const qs = (page: number) => new URLSearchParams({ ...clean, page: String(page) } as Record<string, string>).toString()

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">קמפיינים</h1>
          <p className="text-sm text-wizard-text-secondary">{data.total} קמפיינים שיש לך גישה אליהם</p>
        </div>
        {canCreateCampaigns(ctx.actor) && (
          <Link href="/campaigns/new" className="inline-flex h-10 items-center rounded-xl bg-brand-primary px-4 text-sm font-medium text-white hover:bg-brand-primary/90">קמפיין חדש</Link>
        )}
      </div>

      <form method="get" className="grid gap-2 rounded-2xl border border-wizard-border bg-white p-3 sm:grid-cols-6" role="search" aria-label="סינון קמפיינים">
        <label className="sm:col-span-2">
          <span className="sr-only">חיפוש</span>
          <input name="q" defaultValue={clean.q} placeholder="חיפוש לפי שם קמפיין או לקוח" className="h-10 w-full rounded-xl border border-wizard-border px-3 text-sm" />
        </label>
        <label>
          <span className="sr-only">סטטוס</span>
          <select name="status" defaultValue={clean.status ?? ''} className="h-10 w-full rounded-xl border border-wizard-border px-2 text-sm">
            <option value="">כל הסטטוסים</option>
            {CAMPAIGN_STATUSES.map((s) => <option key={s} value={s}>{heStatus(s)}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">אחראית</span>
          <select name="owner_user_id" defaultValue={clean.owner_user_id ?? ''} className="h-10 w-full rounded-xl border border-wizard-border px-2 text-sm">
            <option value="">כל האחראיות</option>
            {staff.filter((s) => s.role !== 'staff').map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1 text-xs text-wizard-text-secondary">
          מ-<input type="date" name="from" defaultValue={clean.from} className="h-10 w-full rounded-xl border border-wizard-border px-2 text-sm" />
        </label>
        <label className="flex items-center gap-1 text-xs text-wizard-text-secondary">
          עד<input type="date" name="to" defaultValue={clean.to} className="h-10 w-full rounded-xl border border-wizard-border px-2 text-sm" />
        </label>
        <div className="flex gap-2 sm:col-span-6">
          <button className="h-9 rounded-xl bg-brand-primary px-4 text-sm text-white">סינון</button>
          <Link href="/campaigns" className="inline-flex h-9 items-center rounded-xl px-3 text-sm text-wizard-text-secondary hover:bg-brand-pearl">ניקוי</Link>
        </div>
      </form>

      {data.rows.length === 0 ? (
        <Empty title={Object.keys(clean).length ? 'אין קמפיינים שתואמים לסינון' : 'עדיין אין קמפיינים'}>
          {canCreateCampaigns(ctx.actor) ? 'אפשר לפתוח קמפיין חדש מתוך בריף קיים.' : 'קמפיינים יופיעו כאן כשתצורפו אליהם.'}
        </Empty>
      ) : (
        <>
          {/* table on desktop, cards on mobile */}
          <div className="hidden overflow-x-auto rounded-2xl border border-wizard-border bg-white md:block">
            <table className="w-full text-sm">
              <caption className="sr-only">רשימת קמפיינים</caption>
              <thead className="bg-brand-pearl/60 text-right text-xs text-wizard-text-secondary">
                <tr>
                  <th scope="col" className="px-3 py-2">קמפיין</th><th scope="col" className="px-3 py-2">לקוח</th>
                  <th scope="col" className="px-3 py-2">סטטוס</th><th scope="col" className="px-3 py-2">תאריכים</th>
                  <th scope="col" className="px-3 py-2">אחראית</th><th scope="col" className="px-3 py-2">משתתפים</th>
                  <th scope="col" className="px-3 py-2">תוצרים</th><th scope="col" className="px-3 py-2">ממתינים לאישור</th>
                  <th scope="col" className="px-3 py-2">באיחור</th><th scope="col" className="px-3 py-2">תקציב / התחייבויות</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((c) => {
                  const approved = parseMoney(c.approved_budget)
                  const exposure = parseMoney(c.exposure) ?? BigInt(0)
                  const over = approved !== null && exposure > approved
                  return (
                    <tr key={c.id} className="border-t border-wizard-border hover:bg-brand-pearl/30">
                      <td className="px-3 py-2 font-medium"><Link className="text-brand-primary hover:underline" href={`/campaigns/${c.id}`}>{c.name}</Link></td>
                      <td className="px-3 py-2">{c.client_name}</td>
                      <td className="px-3 py-2"><StatusBadge status={c.status} /></td>
                      <td className="px-3 py-2 whitespace-nowrap">{formatDate(c.start_date)} – {formatDate(c.end_date)}</td>
                      <td className="px-3 py-2">{c.owner_name}</td>
                      <td className="px-3 py-2">{c.participants}</td>
                      <td className="px-3 py-2">{c.deliverables}</td>
                      <td className="px-3 py-2">{c.awaiting_approval > 0 ? <StatusBadge status="pending" label={String(c.awaiting_approval)} /> : '0'}</td>
                      <td className="px-3 py-2">{c.overdue > 0 ? <StatusBadge status="dead" label={`${c.overdue} באיחור`} /> : '0'}</td>
                      <td className={`px-3 py-2 whitespace-nowrap ${over ? 'font-semibold text-rose-700' : ''}`}>
                        {formatMoney(approved, c.currency)} / {formatMoney(exposure, c.currency)}{over && ' (חריגה)'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <ul className="space-y-2 md:hidden">
            {data.rows.map((c) => (
              <li key={c.id}>
                <Link href={`/campaigns/${c.id}`} className="block rounded-2xl border border-wizard-border bg-white p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div><div className="font-semibold">{c.name}</div><div className="text-xs text-wizard-text-secondary">{c.client_name}</div></div>
                    <StatusBadge status={c.status} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-wizard-text-secondary">
                    <span>{c.participants} משתתפים</span><span>{c.deliverables} תוצרים</span>
                    {c.awaiting_approval > 0 && <span className="text-amber-800">{c.awaiting_approval} ממתינים לאישור</span>}
                    {c.overdue > 0 && <span className="font-semibold text-rose-700">{c.overdue} באיחור</span>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <nav aria-label="עמודים" className="flex items-center justify-center gap-2 text-sm">
              {data.page > 1 && <Link className="rounded-lg border border-wizard-border bg-white px-3 py-1" href={`/campaigns?${qs(data.page - 1)}`}>הקודם</Link>}
              <span>עמוד {data.page} מתוך {pages}</span>
              {data.page < pages && <Link className="rounded-lg border border-wizard-border bg-white px-3 py-1" href={`/campaigns?${qs(data.page + 1)}`}>הבא</Link>}
            </nav>
          )}
        </>
      )}
    </div>
  )
}
