import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { formatDate, documentTypeLabels, statusLabels } from '@/lib/utils'

export default async function DocumentsPage() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  // Get all user's documents
  const { data: documents } = await supabase
    .from('documents')
    .select('*')
    .eq('user_id', user?.id)
    .order('created_at', { ascending: false })

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-heebo font-bold mb-2">המסמכים שלי</h1>
          <p className="text-muted-foreground">
            {documents?.length || 0} מסמכים
          </p>
        </div>
        <Link href="/create">
          <Button variant="accent">
            <PlusIcon className="w-4 h-4" />
            מסמך חדש
          </Button>
        </Link>
      </div>

      {/* Documents Grid */}
      {documents && documents.length > 0 ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {documents.map((doc) => (
            <Link key={doc.id} href={`/preview/${doc.id}`}>
              <Card className="h-full hover:shadow-lg transition-all duration-300 hover:-translate-y-1 cursor-pointer">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className={`p-2 rounded-lg ${doc.type === 'quote' ? 'bg-accent/10 text-accent' : 'bg-brand-gold/10 text-brand-gold'}`}>
                      {doc.type === 'quote' ? (
                        <QuoteIcon className="w-6 h-6" />
                      ) : (
                        <DeckIcon className="w-6 h-6" />
                      )}
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      doc.status === 'generated' 
                        ? 'bg-green-100 text-green-700'
                        : doc.status === 'draft'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {statusLabels[doc.status]}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardTitle className="text-lg mb-2 line-clamp-2">{doc.title}</CardTitle>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>{documentTypeLabels[doc.type]}</span>
                    <span>&bull;</span>
                    <span>{formatDate(doc.created_at)}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card className="p-12 text-center">
          <div className="text-muted-foreground mb-4">
            <DocumentEmptyIcon className="w-20 h-20 mx-auto opacity-50" />
          </div>
          <h3 className="text-xl font-bold mb-2">אין מסמכים עדיין</h3>
          <p className="text-muted-foreground mb-6">צור את המסמך הראשון שלך עכשיו</p>
          <Link href="/create">
            <Button variant="accent" size="lg">
              <PlusIcon className="w-4 h-4" />
              צור מסמך חדש
            </Button>
          </Link>
        </Card>
      )}
    </div>
  )
}

// Icons
function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  )
}

function QuoteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  )
}

function DeckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
    </svg>
  )
}

function DocumentEmptyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  )
}


