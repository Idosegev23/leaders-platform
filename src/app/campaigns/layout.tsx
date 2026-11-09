import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { moduleEnabled } from '@/lib/campaigns/runtime'
import { PRODUCT } from '@/lib/campaigns/brand'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: PRODUCT.name, robots: { index: false, follow: false } }

/** Brieflow root: the feature flag. Signed-in screens live in (app), sign-in screens in (public). */
export default function BrieflowRoot({ children }: { children: React.ReactNode }) {
  if (!moduleEnabled()) notFound()
  return <div className="min-h-screen bg-[rgb(var(--background))]">{children}</div>
}
