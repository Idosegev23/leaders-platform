import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SendLinkClient from './SendLinkClient'

export const dynamic = 'force-dynamic'

type PageProps = {
  params: Promise<{ slug: string }>
}

export default async function SendPage({ params }: PageProps) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: docType, error } = await supabase
    .from('document_types')
    .select('id, slug, name, description, target_url, flow_type, icon')
    .eq('slug', slug)
    .maybeSingle()

  if (error || !docType) notFound()
  if (docType.flow_type !== 'send_link') {
    // For direct_form rubrics, bounce straight to the target URL.
    return (
      <div dir="rtl" className="max-w-xl mx-auto p-8 text-center">
        <p className="mb-4">רובריקה זו נפתחת ישירות ללא לינק.</p>
        <Link href={docType.target_url} className="text-primary underline">
          פתח {docType.name}
        </Link>
      </div>
    )
  }

  // Recent links the user created for this type.
  const { data: { user } } = await supabase.auth.getUser()
  const { data: recent } = await supabase
    .from('document_links')
    .select('id, token, client_name, client_email, status, created_at, opened_at, completed_at')
    .eq('document_type_id', docType.id)
    .eq('created_by_email', user?.email ?? '')
    .order('created_at', { ascending: false })
    .limit(20)

  return (
    <SendLinkClient
      docType={docType}
      recentLinks={recent ?? []}
    />
  )
}
