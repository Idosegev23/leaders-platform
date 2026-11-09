import Link from 'next/link'
import { listTalentAgencies } from '@/lib/campaigns/services/creators'
import { Empty, Panel } from '@/components/campaigns/ui'
import { NewAgencyButton } from '@/components/campaigns/agencies'
import { load, pageCtx } from '../_server'

export const dynamic = 'force-dynamic'

export default async function AgenciesPage() {
  const ctx = await pageCtx()
  const agencies = await load(() => listTalentAgencies(ctx))
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">סוכנויות כישרונות</h1>
          <p className="text-sm text-wizard-text-secondary">הסוכנות רואה בפורטל את כל היוצרים שהיא מייצגת; כל סוכן רואה רק את היוצרים שהוקצו לו.</p>
        </div>
        <NewAgencyButton />
      </div>
      <Panel>
        {agencies.length === 0 ? <Empty title="אין עדיין סוכנויות">אפשר להוסיף סוכנות, או לייבא יוצרים מקובץ עם עמודת &quot;סוכנות&quot;.</Empty> : (
          <ul className="divide-y divide-wizard-border">
            {agencies.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <Link href={`/campaigns/agencies/${a.id}`} className="font-semibold text-brand-primary hover:underline">{a.name}</Link>
                <span className="text-xs text-wizard-text-secondary">{a.creators} יוצרים · {a.agents} סוכנים</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}
