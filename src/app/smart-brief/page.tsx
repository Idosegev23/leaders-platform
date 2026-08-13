import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { smartBriefServiceClient } from '@/lib/smart-brief/service'
import SmartBriefHome, { type BriefListItem } from './SmartBriefHome'

export const metadata: Metadata = { title: 'מנוע בריפים חכם | Leaders OS' }
export const dynamic = 'force-dynamic'

export default async function SmartBriefPage() {
  let briefs: BriefListItem[] = []
  try {
    const service = smartBriefServiceClient()
    const { data } = await service
      .from('smart_briefs')
      .select('id, template_slug, title, client_name, status, created_by_name, updated_at, opened_at')
      .order('updated_at', { ascending: false })
      .limit(20)
    briefs = (data ?? []) as BriefListItem[]
  } catch { /* table may not exist yet locally */ }

  return (
    <div dir="rtl" className="max-w-6xl mx-auto px-4 md:px-8 py-12 md:py-16 text-brand-primary">
      <header className="mb-10 md:mb-12">
        <Link
          href="/dashboard"
          className="inline-block mb-6 text-[12px] text-brand-primary/55 hover:text-brand-primary transition-colors"
        >
          → חזרה לדשבורד
        </Link>
        <p className="text-[10px] tracking-[0.5em] uppercase text-brand-primary/55 font-rubik mb-5 font-medium">
          Leaders <span className="mx-1 text-brand-primary/75">x</span> OS
        </p>
        <h1 className="text-[34px] md:text-[44px] leading-[1.05] font-medium tracking-tight">
          מנוע בריפים <span className="font-bold">חכם</span>
        </h1>
        <p className="mt-3 text-[14px] md:text-[15px] text-brand-primary/65 max-w-lg leading-relaxed">
          בחר סוג בריף, תאר את הקמפיין במילים שלך — וה-AI יבנה טיוטה מלאה
          מהתיאור וממה שהמערכת כבר יודעת על הלקוח.
        </p>
      </header>

      <Suspense>
        <SmartBriefHome initialBriefs={briefs} />
      </Suspense>
    </div>
  )
}
