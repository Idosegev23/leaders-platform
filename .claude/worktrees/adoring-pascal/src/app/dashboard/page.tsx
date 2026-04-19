import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { formatDate } from '@/lib/utils'
import { isDevMode, DEV_USER } from '@/lib/auth/dev-mode'

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
        <h1 className="text-3xl font-bold mb-1">
          שלום, {firstName}
        </h1>
        <p className="text-muted-foreground">
          צור ונהל הצעות מחיר לקמפיינים
        </p>
      </div>

      {/* Main Action - Create Proposal */}
      <Link href="/create-proposal" className="group block mb-10">
        <Card className="p-8 bg-gradient-to-l from-indigo-900 to-purple-800 border-0 text-white hover:from-indigo-800 hover:to-purple-700 transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-xl">
          <div className="flex items-center gap-6">
            <div className="p-4 rounded-2xl bg-white/10">
              <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-2xl font-bold mb-1">צור הצעת מחיר חדשה</h3>
              <p className="text-white/70 text-sm">
                העלה בריף לקוח ומסמך התנעה - הסוכן יעבד, ינתח, ויבנה הצעה מלאה
              </p>
            </div>
            <span className="text-white/80 font-medium group-hover:text-white text-lg">
              &larr;
            </span>
          </div>
        </Card>
      </Link>

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
                  flowHint = 'עורך מצגת'
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
                  <Link
                    key={doc.id}
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
                    <div className="flex items-center gap-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColor}`}>
                        {statusLabel}
                      </span>
                      <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                      </svg>
                    </div>
                  </Link>
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
