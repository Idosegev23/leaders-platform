'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Spinner } from '@/components/ui/spinner'
import ProposalWizard from '@/components/wizard/proposal-wizard'

export default function WizardPage() {
  const params = useParams()
  const router = useRouter()
  const documentId = params.id as string

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [documentData, setDocumentData] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    async function loadDocument() {
      try {
        const res = await fetch(`/api/documents/${documentId}`)
        if (!res.ok) {
          if (res.status === 404) {
            setError('המסמך לא נמצא')
            return
          }
          throw new Error('Failed to load document')
        }

        const doc = await res.json()
        setDocumentData(doc.document?.data || {})
      } catch (err) {
        console.error('[Wizard] Load error:', err)
        setError(err instanceof Error ? err.message : 'שגיאה בטעינת המסמך')
      } finally {
        setLoading(false)
      }
    }

    if (documentId) {
      loadDocument()
    }
  }, [documentId])

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Spinner />
          <p className="mt-4 text-muted-foreground">טוען הצעה...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 text-lg mb-4">{error}</p>
          <button
            className="text-primary underline"
            onClick={() => router.push('/dashboard')}
          >
            חזרה לדשבורד
          </button>
        </div>
      </div>
    )
  }

  if (!documentData) {
    return null
  }

  return (
    <div className="min-h-screen bg-background">
      <ProposalWizard
        documentId={documentId}
        initialData={documentData}
      />
    </div>
  )
}
