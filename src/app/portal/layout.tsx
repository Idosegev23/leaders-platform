import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { moduleEnabled } from '@/lib/campaigns/runtime'
import { PortalLogout } from '@/components/campaigns/portal/logout'
import { PRODUCT } from '@/lib/campaigns/brand'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: `${PRODUCT.name} · פורטל קמפיינים`, referrer: 'no-referrer', robots: { index: false, follow: false } }

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  if (!moduleEnabled()) notFound()
  return (
    <div className="min-h-screen bg-[rgb(var(--background))]">
      <header className="border-b border-wizard-border bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <span className="text-sm font-bold text-brand-primary">{PRODUCT.name} <span className="font-normal text-wizard-text-secondary">· פורטל קמפיינים</span></span>
          <PortalLogout />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-5">{children}</main>
    </div>
  )
}
