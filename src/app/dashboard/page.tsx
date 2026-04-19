import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { formatDate } from '@/lib/utils'
import { isDevMode, DEV_USER } from '@/lib/auth/dev-mode'
import { ConfirmSubmitButton } from '@/components/dashboard/confirm-submit-button'

interface DocumentRow {
  id: string
  title: string
  type: string
  status: string
  created_at: string
  data: Record<string, unknown> | null
}

export default async function DashboardPage() {
  let profile: { full_name?: string | null } | null = null
  let documents: DocumentRow[] = []

  if (isDevMode) {
    profile = { full_name: DEV_USER.full_name }
    documents = []
  } else {
    const supabase = await createClient()

    const { data: { user: authUser } } = await supabase.auth.getUser()

    const { data: docs } = await supabase
      .from('documents')
      .select('id, title, type, status, created_at, data')
      .eq('user_id', authUser?.id)
      .order('created_at', { ascending: false })
      .limit(10)

    documents = (docs || []) as DocumentRow[]

    const { data: prof } = await supabase
      .from('users')
      .select('full_name')
      .eq('id', authUser?.id)
      .single()

    profile = prof
  }

  const firstName = profile?.full_name?.split(' ')[0] || 'משתמש'

  return (
    <div dir="rtl" className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <p className="text-sm text-muted-foreground mb-1">Leaders AI</p>
        <h1 className="text-3xl font-bold mb-1">
          שלום, {firstName}
        </h1>
        <p className="text-muted-foreground">
          צור ונהל הצעות מחיר ומצגות קריאטיב
        </p>
      </div>

      {/* Main Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
        {/* Create Proposal */}
        <Link href="/create-proposal" className="group block">
          <Card className="p-6 h-full bg-gradient-to-l from-indigo-900 to-purple-800 border-0 text-white hover:from-indigo-800 hover:to-purple-700 transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-xl">
            <div className="flex items-center gap-5">
              <div className="p-3 rounded-2xl bg-white/10 shrink-0">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-xl font-bold mb-1">מצגת קריאטיב</h3>
                <p className="text-white/70 text-sm">
                  העלה בריף לקוח - הסוכן יבנה הצעה מלאה עם מצגת
                </p>
              </div>
              <span className="text-white/60 group-hover:text-white text-lg shrink-0">&larr;</span>
            </div>
          </Card>
        </Link>

        {/* Price Quote */}
        <Link href="/price-quote" className="group block">
          <Card className="p-6 h-full bg-gradient-to-l from-emerald-900 to-teal-800 border-0 text-white hover:from-emerald-800 hover:to-teal-700 transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-xl">
            <div className="flex items-center gap-5">
              <div className="p-3 rounded-2xl bg-white/10 shrink-0">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-xl font-bold mb-1">הצעת מחיר</h3>
                <p className="text-white/70 text-sm">
                  צור הצעת מחיר מקצועית עם טבלת שירותים ותמחור
                </p>
              </div>
              <span className="text-white/60 group-hover:text-white text-lg shrink-0">&larr;</span>
            </div>
          </Card>
        </Link>
      </div>

      {/* Recent Proposals */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>הצעות אחרונות</CardTitle>
        </CardHeader>
        <CardContent>
          {documents.length > 0 ? (
            <div className="space-y-2">
              {documents.map((doc) => {
                const docData = (doc.data || {}) as Record<string, unknown>
                const brandName = (docData.brandName as string) || ''
                const pipelineStatus = (docData._pipelineStatus || {}) as Record<string, string>
                const hasPresentation = !!(docData._presentation as { slides?: unknown[] })?.slides
                const isWizardComplete = !!docData._wizardComplete
                const hasWizardData = !!docData._stepData || !!docData._extractedData
                const researchDone = pipelineStatus.research === 'complete'
                const slidesGenerated = pipelineStatus.slideGeneration === 'complete' || hasPresentation
                const bgPipeline = docData._pipeline as { status?: string; mode?: string; progress?: number; currentSlide?: number; totalSlides?: number } | undefined
                const isBackgroundGenerating = bgPipeline?.mode === 'background' && bgPipeline?.status === 'generating'

                // Determine where to send the user based on pipeline state
                let href: string
                let statusLabel: string
                let statusColor: string
                let flowHint: string

                if (isBackgroundGenerating) {
                  href = `/generate/${doc.id}`
                  const slideInfo = bgPipeline.currentSlide && bgPipeline.totalSlides
                    ? ` (${bgPipeline.currentSlide}/${bgPipeline.totalSlides})`
                    : ''
                  statusLabel = `בהפקה...${slideInfo}`
                  statusColor = 'bg-yellow-100 text-yellow-700 animate-pulse'
                  flowHint = 'הפקה ברקע'
                } else if (slidesGenerated) {
                  href = `/edit/${doc.id}`
                  statusLabel = 'מצגת מוכנה'
                  statusColor = 'bg-green-100 text-green-700'
                  flowHint = 'צפייה ועריכה'
                } else if (isWizardComplete) {
                  href = `/generate/${doc.id}`
                  statusLabel = 'ממתין ליצירה'
                  statusColor = 'bg-purple-100 text-purple-700'
                  flowHint = 'יצירת מצגת'
                } else if (researchDone || hasWizardData) {
                  href = `/wizard/${doc.id}`
                  statusLabel = 'בעריכה'
                  statusColor = 'bg-blue-100 text-blue-700'
                  flowHint = 'עריכת הצעה'
                } else {
                  href = `/research/${doc.id}`
                  statusLabel = 'ממתין למחקר'
                  statusColor = 'bg-amber-100 text-amber-700'
                  flowHint = 'מחקר'
                }

                return (
                  <div key={doc.id} className="relative group">
                  <Link
                    href={href}
                    className="flex items-center justify-between p-4 rounded-lg hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-lg">
                        {brandName ? brandName.charAt(0) : '#'}
                      </div>
                      <div>
                        <p className="font-medium">{doc.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(doc.created_at)}
                          {' · '}
                          {flowHint}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColor}`}>
                        {statusLabel}
                      </span>
                      {/* Quick actions for completed docs */}
                      {slidesGenerated && (
                        <Link
                          href={`/wizard/${doc.id}`}
                          className="px-2 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                        >
                          ערוך תוכן
                        </Link>
                      )}
                      <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                      </svg>
                    </div>
                  </Link>
                  {/* Delete button */}
                  <form action={async () => {
                    'use server'
                    const { createClient } = await import('@/lib/supabase/server')
                    const supabase = await createClient()
                    await supabase.from('documents').delete().eq('id', doc.id)
                  }}>
                    <ConfirmSubmitButton
                      confirmMessage="למחוק את ההצעה?"
                      title="מחק הצעה"
                      className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-500"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </ConfirmSubmitButton>
                  </form>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-16">
              <svg className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <p className="text-muted-foreground mb-4">עדיין לא יצרת הצעות מחיר</p>
              <Link href="/create-proposal">
                <Button>צור הצעה ראשונה</Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
