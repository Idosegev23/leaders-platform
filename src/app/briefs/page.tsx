import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import BriefsList, { type BriefRow } from './BriefsList'

export const dynamic = 'force-dynamic'

/**
 * /briefs — central hub for managing every client-brief that's been sent.
 * The page is intentionally global (service-role read) — BD-team works
 * collaboratively, not per-user.
 *
 * Two purposes:
 *   1. Quick read of "what's where" without bouncing to Drive.
 *   2. Marking outcome (נסגר/נפל) without opening Drive — the action
 *      moves the per-client folder and (for "won") eagerly creates the
 *      workspace.
 */
export default async function BriefsHubPage() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  // Resolve client-brief document_type id once.
  const { data: docType } = await supabase
    .from('document_types')
    .select('id, name')
    .eq('slug', 'client-brief')
    .maybeSingle()

  let rows: BriefRow[] = []
  if (docType?.id) {
    const { data } = await supabase
      .from('document_links')
      .select(`
        id, token, status, client_name, client_email, created_by_email,
        created_by_name, metadata, created_at, opened_at, completed_at
      `)
      .eq('document_type_id', docType.id)
      .order('created_at', { ascending: false })
      .limit(200)

    rows = (data ?? []).map((r) => {
      const meta = (r.metadata as Record<string, unknown> | null) ?? {}
      return {
        id: r.id,
        token: r.token,
        status: r.status,
        clientName: r.client_name,
        clientEmail: r.client_email,
        createdByName: r.created_by_name,
        createdByEmail: r.created_by_email,
        createdAt: r.created_at,
        openedAt: r.opened_at,
        completedAt: r.completed_at,
        outcome: (meta.outcome as 'won' | 'lost' | undefined) ?? null,
        outcomeAt: (meta.outcome_at as string | undefined) ?? null,
        outcomeByName: (meta.outcome_by_name as string | undefined) ?? null,
        driveFolderLink: (meta.brief_drive_folder_link as string | undefined) ?? null,
        briefDocLink: (meta.brief_drive_doc_link as string | undefined) ?? null,
        workspaceLink: (meta.workspace_drive_folder_link as string | undefined) ?? null,
        language: ((meta.language as string | undefined) === 'en' ? 'en' : 'he') as 'he' | 'en',
        reminderSentAt: (meta.reminder_sent_at as string | undefined) ?? null,
        reminderCount: Number(meta.reminder_count || 0),
      }
    })
  }

  return (
    <div dir="rtl" className="max-w-6xl mx-auto px-4 md:px-8 py-10 md:py-14 text-brand-primary">
      <div className="mb-10 flex items-center justify-between gap-3 flex-wrap">
        <Link
          href="/dashboard"
          className="text-[12px] tracking-[0.16em] text-brand-primary/65 hover:text-brand-accent transition-colors font-rubik font-medium"
        >
          ← חזרה לדשבורד
        </Link>
        <Link
          href="/send/client-brief"
          className="text-[11px] tracking-[0.24em] uppercase text-brand-primary/60 hover:text-brand-accent transition-colors font-rubik font-medium"
        >
          שליחת בריף חדש ↗
        </Link>
      </div>

      <header className="mb-12">
        <p className="text-[10px] tracking-[0.5em] uppercase text-brand-primary/55 font-rubik mb-5 font-medium">
          Leaders <span className="mx-1 text-brand-primary/75">x</span> OS
        </p>
        <h1 className="text-[34px] md:text-[44px] leading-[1.05] font-medium tracking-tight">
          תיקיית <span className="font-bold">בריפים</span>.
        </h1>
        <p className="mt-3 text-[14px] md:text-[15px] text-brand-primary/65 max-w-xl leading-relaxed">
          כל הבריפים שנשלחו ללקוחות. אחרי הצגת ההצעה — סמנו את התוצאה כאן.
          סימון <span className="font-semibold">נסגר</span> ייצור אוטומטית את תיקיית הלקוח ב‑Drive.
        </p>
      </header>

      <BriefsList initialRows={rows} />
    </div>
  )
}
