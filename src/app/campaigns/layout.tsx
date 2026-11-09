import Link from 'next/link'
import { notFound } from 'next/navigation'
import { DomainError } from '@/lib/campaigns/errors'
import { currentInternalActor, devAuthEnabled, moduleEnabled } from '@/lib/campaigns/runtime'
import { DevLogin, DevSwitchUser } from '@/components/campaigns/dev-login'
import { PermissionDenied } from './_server'
import { PRODUCT } from '@/lib/campaigns/brand'

export const dynamic = 'force-dynamic'

const ROLE_HE = { admin: 'מנהל/ת מערכת', manager: 'מנהלת קמפיין', staff: 'צוות' } as const

export default async function CampaignsLayout({ children }: { children: React.ReactNode }) {
  if (!moduleEnabled()) notFound()
  let actor = null
  let forbidden: string | null = null
  try {
    actor = await currentInternalActor()
  } catch (e) {
    if (e instanceof DomainError && e.code === 'FORBIDDEN') forbidden = e.message
    else throw e
  }
  if (forbidden) return <div className="p-6"><PermissionDenied message={forbidden} /></div>
  if (!actor) {
    if (devAuthEnabled()) return <DevLogin />
    // Middleware normally redirects before we get here.
    return <div className="p-6"><PermissionDenied message="נדרשת התחברות עם חשבון הצוות." /></div>
  }

  return (
    <div className="min-h-screen bg-[rgb(var(--background))]">
      <header className="sticky top-0 z-30 border-b border-wizard-border bg-white/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
          <Link href="/campaigns" className="text-sm font-bold text-brand-primary">{PRODUCT.name} <span className="font-normal text-wizard-text-secondary">{PRODUCT.byline}</span></Link>
          <nav aria-label="ניווט קמפיינים" className="flex flex-wrap gap-1 text-sm">
            <Link className="rounded-lg px-2.5 py-1.5 hover:bg-brand-pearl" href="/campaigns">קמפיינים</Link>
            <Link className="rounded-lg px-2.5 py-1.5 hover:bg-brand-pearl" href="/campaigns/tasks">המשימות שלי</Link>
            <Link className="rounded-lg px-2.5 py-1.5 hover:bg-brand-pearl" href="/campaigns/creators">מאגר משפיענים</Link>
            {actor.role === 'admin' && <Link className="rounded-lg px-2.5 py-1.5 hover:bg-brand-pearl" href="/campaigns/admin">הרשאות</Link>}
          </nav>
          <div className="ms-auto flex items-center gap-2 text-xs text-wizard-text-secondary">
            <span>{actor.name} · {ROLE_HE[actor.role]}</span>
            {devAuthEnabled() && <DevSwitchUser />}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-5">{children}</main>
    </div>
  )
}
