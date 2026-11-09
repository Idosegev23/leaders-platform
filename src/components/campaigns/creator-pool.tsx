'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { api, ApiError, newIdempotencyKey } from './client-api'
import { Btn, Dialog, Empty, Field, Notice, SelectInput, StatusBadge, TextArea, TextInput, useAction, useUnsavedGuard } from './ui'

type Creator = { id: string; display_name: string; status: string; categories: string[]; agency_name: string | null; agent_names: string | null; accounts: { platform: string; handle: string; follower_count: number | null }[]; in_campaign: boolean }
const PLATFORMS = ['instagram', 'tiktok', 'youtube', 'facebook', 'x', 'linkedin', 'other']

type AgencyOpt = { id: string; name: string }
type AgentOpt = { id: string; display_name: string; talent_agency_id: string | null }

export function CreatorPool({ creators, agencies, agents, campaigns, initialCampaign, filters }: {
  creators: { rows: Creator[]; total: number; page: number; pageSize: number }; agencies: AgencyOpt[]; agents: AgentOpt[]
  campaigns: { id: string; name: string }[]; initialCampaign: string; filters: Record<string, string>
}) {
  const router = useRouter()
  const [campaign, setCampaign] = React.useState(initialCampaign)
  const [picked, setPicked] = React.useState<Set<string>>(new Set())
  const [creating, setCreating] = React.useState(false)
  const [importing, setImporting] = React.useState(false)
  const { busy, run } = useAction()
  const pages = Math.max(1, Math.ceil(creators.total / creators.pageSize))
  const qs = (extra: Record<string, string>) => new URLSearchParams({ ...filters, ...(campaign ? { campaign } : {}), ...extra }).toString()

  async function addToCampaign() {
    const r = await run(() => api<{ added: string[]; duplicates: string[] }>(`/api/campaigns/${campaign}/participations`, { body: { creator_ids: Array.from(picked) } }))
    if (r) {
      toast.success(`נוספו ${r.added.length} משפיענים${r.duplicates.length ? `; ${r.duplicates.length} כבר היו בקמפיין` : ''}`)
      setPicked(new Set())
    }
  }

  return (
    <div className="space-y-3">
      <form method="get" role="search" aria-label="סינון משפיענים" className="grid gap-2 rounded-2xl border border-wizard-border bg-white p-3 sm:grid-cols-6">
        {campaign && <input type="hidden" name="campaign" value={campaign} />}
        <label className="sm:col-span-2"><span className="sr-only">חיפוש</span><input name="q" defaultValue={filters.q} placeholder="שם, דוא״ל או @handle" className="h-10 w-full rounded-xl border border-wizard-border px-3 text-sm" /></label>
        <label><span className="sr-only">קטגוריה</span><input name="category" defaultValue={filters.category} placeholder="קטגוריה (למשל ספורט)" className="h-10 w-full rounded-xl border border-wizard-border px-3 text-sm" /></label>
        <label><span className="sr-only">סוכנות</span>
          <select name="talent_agency_id" defaultValue={filters.talent_agency_id ?? ''} className="h-10 w-full rounded-xl border border-wizard-border px-2 text-sm"><option value="">כל הסוכנויות</option>{agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        </label>
        <label><span className="sr-only">פלטפורמה</span>
          <select name="platform" defaultValue={filters.platform ?? ''} className="h-10 w-full rounded-xl border border-wizard-border px-2 text-sm"><option value="">כל הפלטפורמות</option>{PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}</select>
        </label>
        <button className="h-10 rounded-xl bg-brand-primary text-sm text-white">חיפוש</button>
      </form>

      <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-wizard-border bg-white p-3">
        <Field label="הוספה לקמפיין" htmlFor="pool-camp">
          <SelectInput id="pool-camp" value={campaign} onChange={(e) => { setCampaign(e.target.value); router.replace(`/campaigns/creators?${new URLSearchParams({ ...filters, ...(e.target.value ? { campaign: e.target.value } : {}) })}`) }}>
            <option value="">בחירת קמפיין…</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </SelectInput>
        </Field>
        <Btn busy={busy} disabled={!campaign || picked.size === 0} onClick={() => void addToCampaign()}>הוספת {picked.size} נבחרים</Btn>
        {campaign && <Link href={`/campaigns/${campaign}?tab=creators`} className="self-center text-sm text-brand-primary underline">לקמפיין</Link>}
        <Btn tone="secondary" className="ms-auto" onClick={() => setImporting(true)}>ייבוא מקובץ</Btn>
        <Btn tone="secondary" onClick={() => setCreating(true)}>יוצר/ת חדש/ה</Btn>
      </div>

      {creators.rows.length === 0 ? <Empty title="לא נמצאו משפיענים">אפשר להוסיף יוצר/ת חדש/ה ידנית.</Empty> : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {creators.rows.map((c) => (
            <li key={c.id} className="rounded-xl border border-wizard-border bg-white p-3">
              <div className="flex items-start gap-2">
                <input type="checkbox" aria-label={`בחירת ${c.display_name}`} className="mt-1" disabled={c.in_campaign || c.status === 'blocked'} checked={picked.has(c.id)}
                  onChange={(e) => { const n = new Set(picked); if (e.target.checked) n.add(c.id); else n.delete(c.id); setPicked(n) }} />
                <div className="min-w-0 flex-1">
                  <Link href={`/campaigns/creators/${c.id}`} className="font-semibold text-brand-primary hover:underline">{c.display_name}</Link>
                  <div className="text-xs text-wizard-text-secondary">{c.accounts.map((a) => `${a.platform} @${a.handle}${a.follower_count ? ` · ${a.follower_count.toLocaleString('he-IL')}` : ''}`).join(' | ') || 'ללא חשבונות'}</div>
                  {(c.agency_name || c.agent_names) && <div className="text-xs">{c.agency_name ? `סוכנות: ${c.agency_name}` : ''}{c.agent_names ? ` · סוכן: ${c.agent_names}` : ''}</div>}
                  <div className="mt-1 flex flex-wrap gap-1">
                    {c.categories.map((cat) => <span key={cat} className="rounded bg-brand-pearl px-1.5 text-[11px]">{cat}</span>)}
                    {c.in_campaign && <StatusBadge status="active" label="כבר בקמפיין" />}
                    {c.status !== 'active' && <StatusBadge status={c.status === 'blocked' ? 'dead' : 'withdrawn'} label={c.status === 'blocked' ? 'חסום' : 'לא פעיל'} />}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {pages > 1 && (
        <nav aria-label="עמודים" className="flex justify-center gap-2 text-sm">
          {creators.page > 1 && <Link className="rounded-lg border border-wizard-border bg-white px-3 py-1" href={`/campaigns/creators?${qs({ page: String(creators.page - 1) })}`}>הקודם</Link>}
          <span>עמוד {creators.page} מתוך {pages}</span>
          {creators.page < pages && <Link className="rounded-lg border border-wizard-border bg-white px-3 py-1" href={`/campaigns/creators?${qs({ page: String(creators.page + 1) })}`}>הבא</Link>}
        </nav>
      )}
      {creating && <CreatorForm agencies={agencies} agents={agents} onClose={() => setCreating(false)} />}
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
    </div>
  )
}

export function CreatorForm({ agencies, agents, onClose }: { agencies: AgencyOpt[]; agents: AgentOpt[]; onClose: () => void }) {
  const router = useRouter()
  const [f, setF] = React.useState({ display_name: '', email: '', phone: '', talent_agency_id: '', agent_id: '', categories: '', internal_notes: '', besti_account_id: '' })
  const [accounts, setAccounts] = React.useState([{ platform: 'instagram', handle: '', follower_count: '', profile_url: '' }])
  const [dup, setDup] = React.useState<{ creator_id: string; display_name: string; reason: string }[] | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [idem] = React.useState(newIdempotencyKey)
  const [dirty, setDirty] = React.useState(false)
  useUnsavedGuard(dirty)
  const set = (k: keyof typeof f, v: string) => { setF((x) => ({ ...x, [k]: v })); setDirty(true) }
  return (
    <Dialog open onClose={onClose} title="יוצר/ת חדש/ה">
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        setDup(null)
        try {
          await api('/api/campaigns/creators', { idempotencyKey: idem, body: {
            ...f, talent_agency_id: f.talent_agency_id || null, agent_id: f.agent_id || null, categories: f.categories.split(',').map((c) => c.trim()).filter(Boolean),
            social_accounts: accounts.filter((a) => a.handle.trim()).map((a) => ({ platform: a.platform, handle: a.handle, follower_count: a.follower_count ? Number(a.follower_count.replace(/,/g, '')) : null, profile_url: a.profile_url || null })),
          } })
          toast.success('היוצר/ת נוסף/ה למאגר')
          setDirty(false)
          onClose()
          router.refresh()
        } catch (err) {
          if (err instanceof ApiError && err.code === 'CONFLICT') setDup((err.details?.duplicates as typeof dup) ?? [])
          toast.error(err instanceof ApiError ? err.message : 'השמירה נכשלה')
        } finally {
          setBusy(false)
        }
      }}>
        {dup && <Notice tone="warn">נמצא יוצר דומה במאגר: {dup.map((d) => <Link key={d.creator_id} className="underline" href={`/campaigns/creators/${d.creator_id}`}>{d.display_name} ({d.reason}) </Link>)}</Notice>}
        <Field label="שם *" htmlFor="cf-name"><TextInput id="cf-name" value={f.display_name} onChange={(e) => set('display_name', e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="דוא״ל" htmlFor="cf-email"><TextInput id="cf-email" type="email" dir="ltr" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="טלפון" htmlFor="cf-phone" hint="ינורמל לפורמט בינלאומי"><TextInput id="cf-phone" dir="ltr" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-[13px] font-semibold text-wizard-text-secondary">חשבונות ברשתות</legend>
          {accounts.map((a, i) => (
            <div key={i} className="grid grid-cols-[110px_1fr_100px] gap-2">
              <SelectInput aria-label="פלטפורמה" value={a.platform} onChange={(e) => { const n = [...accounts]; n[i] = { ...a, platform: e.target.value }; setAccounts(n) }}>{PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}</SelectInput>
              <TextInput aria-label="שם משתמש" dir="ltr" placeholder="@handle" value={a.handle} onChange={(e) => { const n = [...accounts]; n[i] = { ...a, handle: e.target.value }; setAccounts(n); setDirty(true) }} />
              <TextInput aria-label="עוקבים" dir="ltr" inputMode="numeric" placeholder="עוקבים" value={a.follower_count} onChange={(e) => { const n = [...accounts]; n[i] = { ...a, follower_count: e.target.value }; setAccounts(n) }} />
            </div>
          ))}
          <Btn size="sm" tone="ghost" onClick={() => setAccounts([...accounts, { platform: 'tiktok', handle: '', follower_count: '', profile_url: '' }])}>+ חשבון נוסף</Btn>
        </fieldset>
        <div className="grid grid-cols-2 gap-2">
          <Field label="סוכנות כישרונות" htmlFor="cf-agency"><SelectInput id="cf-agency" value={f.talent_agency_id} onChange={(e) => { set('talent_agency_id', e.target.value); set('agent_id', '') }}><option value="">עצמאי/ת</option>{agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</SelectInput></Field>
          <Field label="סוכן מטפל" htmlFor="cf-agent"><SelectInput id="cf-agent" value={f.agent_id} onChange={(e) => set('agent_id', e.target.value)}><option value="">ללא</option>{agents.filter((a) => !a.talent_agency_id || a.talent_agency_id === f.talent_agency_id).map((a) => <option key={a.id} value={a.id}>{a.display_name}</option>)}</SelectInput></Field>
          <Field label="קטגוריות" htmlFor="cf-cat" hint="מופרדות בפסיק"><TextInput id="cf-cat" value={f.categories} onChange={(e) => set('categories', e.target.value)} /></Field>
        </div>
        <Field label="מזהה חשבון ב-Besti (קישור ידני)" htmlFor="cf-besti"><TextInput id="cf-besti" dir="ltr" value={f.besti_account_id} onChange={(e) => set('besti_account_id', e.target.value)} /></Field>
        <Field label="הערות פנימיות" htmlFor="cf-notes"><TextArea id="cf-notes" value={f.internal_notes} onChange={(e) => set('internal_notes', e.target.value)} /></Field>
        <div className="flex gap-2"><Btn type="submit" busy={busy} disabled={!f.display_name.trim()}>שמירה</Btn><Btn tone="secondary" onClick={onClose}>ביטול</Btn></div>
      </form>
    </Dialog>
  )
}

type ImportPreview = {
  rows: { line: number; status: 'ready' | 'duplicate' | 'error'; messages: string[]; display_name: string; email: string | null; phone: string | null; agency: string | null; accounts: { platform: string; handle: string }[] }[]
  missingAgencies: string[]
  summary: { total: number; ready: number; duplicate: number; error: number }
}

/** CSV import: choose a file → preview every row → create only the ready rows. */
function ImportDialog({ onClose }: { onClose: () => void }) {
  const [csv, setCsv] = React.useState<string | null>(null)
  const [fileName, setFileName] = React.useState('')
  const [preview, setPreview] = React.useState<ImportPreview | null>(null)
  const [createAgencies, setCreateAgencies] = React.useState(true)
  const [result, setResult] = React.useState<{ created: number; createdAgencies: number; failed: { line: number; message: string }[] } | null>(null)
  const { busy, run } = useAction()
  const STATUS_HE = { ready: 'ייווצר', duplicate: 'כפילות — ידולג', error: 'שגיאה — ידולג' }
  return (
    <Dialog open onClose={onClose} title="ייבוא יוצרים מקובץ">
      {result ? (
        <div className="space-y-3">
          <Notice tone="good">נוצרו {result.created} יוצרים{result.createdAgencies ? ` ו-${result.createdAgencies} סוכנויות` : ''}.</Notice>
          {result.failed.length > 0 && <Notice tone="warn">{result.failed.map((f) => `שורה ${f.line}: ${f.message}`).join(' · ')}</Notice>}
          <Btn onClick={onClose}>סגירה</Btn>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm">קובץ CSV (באקסל: שמירה בשם → CSV UTF-8). שורה ראשונה = כותרות: <strong>שם</strong> (חובה), דוא&quot;ל, טלפון, אינסטגרם, טיקטוק, יוטיוב, עוקבים, קטגוריות, סוכנות, הערות.</p>
          <label className="block">
            <span className="sr-only">קובץ CSV</span>
            <input type="file" accept=".csv,text/csv" className="block w-full text-sm" onChange={async (e) => {
              const f = e.target.files?.[0]
              if (!f) return
              if (f.size > 2 * 1024 * 1024) { toast.error('הקובץ גדול מ-2MB'); return }
              setFileName(f.name); setPreview(null)
              const text = await f.text()
              setCsv(text)
              const r = await run(() => api<ImportPreview>('/api/campaigns/creators/import', { body: { mode: 'preview', csv: text } }), { refresh: false })
              if (r) setPreview(r)
            }} />
          </label>
          {busy && !preview && <p className="text-sm text-wizard-text-secondary">בודק את {fileName}…</p>}
          {preview && (
            <>
              <Notice>{preview.summary.total} שורות: {preview.summary.ready} ייווצרו, {preview.summary.duplicate} כפילויות, {preview.summary.error} שגיאות. שום דבר לא נשמר עדיין.</Notice>
              {preview.missingAgencies.length > 0 && (
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={createAgencies} onChange={(e) => setCreateAgencies(e.target.checked)} />
                  ליצור סוכנויות חדשות: {preview.missingAgencies.join(', ')}</label>
              )}
              <div className="max-h-72 overflow-auto rounded-xl border border-wizard-border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-brand-pearl text-right"><tr><th scope="col" className="p-1.5">שורה</th><th scope="col" className="p-1.5">שם</th><th scope="col" className="p-1.5">פרטים</th><th scope="col" className="p-1.5">מצב</th></tr></thead>
                  <tbody>
                    {preview.rows.map((r) => (
                      <tr key={r.line} className={`border-t border-wizard-border ${r.status === 'error' ? 'bg-rose-50' : r.status === 'duplicate' ? 'bg-amber-50' : ''}`}>
                        <td className="p-1.5">{r.line}</td>
                        <td className="p-1.5">{r.display_name || '—'}</td>
                        <td className="p-1.5" dir="ltr">{[r.email, r.phone, ...r.accounts.map((a) => `${a.platform}:@${a.handle}`), r.agency].filter(Boolean).join(' · ')}</td>
                        <td className="p-1.5">{STATUS_HE[r.status]}{r.messages.length ? <div className="text-[11px]">{r.messages.join('; ')}</div> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-2">
                <Btn busy={busy} disabled={!csv || preview.summary.ready === 0 || (preview.missingAgencies.length > 0 && !createAgencies)} onClick={async () => {
                  const r = await run(() => api<{ created: number; createdAgencies: number; failed: { line: number; message: string }[] }>('/api/campaigns/creators/import',
                    { body: { mode: 'commit', csv, create_missing_agencies: createAgencies } }), { success: 'הייבוא הושלם' })
                  if (r) setResult(r)
                }}>ייבוא {preview.summary.ready} יוצרים</Btn>
                <Btn tone="secondary" onClick={onClose}>ביטול</Btn>
              </div>
            </>
          )}
        </div>
      )}
    </Dialog>
  )
}
