import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentStaff, devAuthEnabled } from '@/lib/campaigns/runtime'
import { PRODUCT } from '@/lib/campaigns/brand'
import { OrgSwitcher, SignOut } from '@/components/campaigns/staff-session'
import { PermissionDenied } from './_server'

export const dynamic = 'force-dynamic'

const ROLE_HE = { admin: 'מנהל/ת ארגון', manager: 'מנהלת קמפיין', staff: 'צוות' } as const

export default async function BrieflowAppLayout({ children }: { children: React.ReactNode }) {
  const staff = await currentStaff()
  if (!staff.account) redirect('/campaigns/login')
  const actor = staff.actor

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-wizard-border bg-white/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
          <Link href="/campaigns" className="text-sm font-bold text-brand-primary">{PRODUCT.name} <span className="font-normal text-wizard-text-secondary">{PRODUCT.byline}</span></Link>
          {actor && (
            <nav aria-label="ניווט ראשי" className="flex flex-wrap gap-1 text-sm">
              <Link className="rounded-lg px-2.5 py-1.5 hover:bg-brand-pearl" href="/campaigns">קמפיינים</Link>
              <Link className="rounded-lg px-2.5 py-1.5 hover:bg-brand-pearl" href="/campaigns/tasks">המשימות שלי</Link>
              <Link className="rounded-lg px-2.5 py-1.5 hover:bg-brand-pearl" href="/campaigns/creators">משפיענים</Link>
              <Link className="rounded-lg px-2.5 py-1.5 hover:bg-brand-pearl" href="/campaigns/agencies">סוכנויות</Link>
              <Link className="rounded-lg px-2.5 py-1.5 hover:bg-brand-pearl" href="/campaigns/clients">לקוחות</Link>
              {actor.role === 'admin' && <Link className="rounded-lg px-2.5 py-1.5 hover:bg-brand-pearl" href="/campaigns/settings">הגדרות הארגון</Link>}
              {staff.platformAdmin && <Link className="rounded-lg px-2.5 py-1.5 hover:bg-brand-pearl" href="/campaigns/platform">ארגונים</Link>}
            </nav>
          )}
          <div className="ms-auto flex flex-wrap items-center gap-2 text-xs text-wizard-text-secondary">
            {staff.memberships.length > 1 && actor
              ? <OrgSwitcher current={actor.orgId} orgs={staff.memberships.map((m) => ({ id: m.orgId, name: m.orgName }))} />
              : actor && <span className="font-semibold text-foreground">{actor.orgName}</span>}
            <span>{staff.account.full_name}{actor ? ` · ${ROLE_HE[actor.role]}` : ''}</span>
            <SignOut dev={devAuthEnabled()} />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-5">
        {actor || staff.platformAdmin ? children : (
          <PermissionDenied message={`החשבון ${staff.account.email} אינו חבר פעיל באף ארגון ב-${PRODUCT.name}. אם הוזמנת, פתח/י את קישור ההזמנה מהמייל; אחרת פנה/י למנהל הארגון.`} />
        )}
      </main>
    </div>
  )
}
