'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'
import { StructuredChat } from '@/components/chat/structured-chat'

function CreatePageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const documentType = (searchParams.get('type') || 'quote') as 'quote' | 'deck'

  async function handleComplete(data: Record<string, unknown>) {
    console.log('Document data collected:', data)
    
    try {
      // Save document to database
      const response = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: documentType,
          title: (data.docTitle as string) || (data.title as string) || 'מסמך חדש',
          data: data,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to create document')
      }

      const result = await response.json()
      
      // Redirect to preview
      router.push(`/preview/${result.id}`)
    } catch (error) {
      console.error('Error creating document:', error)
      alert('שגיאה ביצירת המסמך')
    }
  }

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800">
              {documentType === 'quote' ? '📄 יצירת הצעת מחיר' : '🎨 יצירת מצגת'}
            </h1>
            <p className="text-sm text-gray-500">
              ענה על השאלות ואנחנו ניצור עבורך מסמך מקצועי
            </p>
          </div>
          <button
            onClick={() => router.push('/dashboard')}
            className="text-gray-500 hover:text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            ✕ ביטול
          </button>
        </div>
      </header>

      {/* Chat area */}
      <main className="flex-1 overflow-hidden p-6">
        <div className="max-w-2xl mx-auto h-full">
          <StructuredChat 
            documentType={documentType}
            onComplete={handleComplete}
          />
        </div>
      </main>
    </div>
  )
}

export default function CreatePage() {
  return (
    <Suspense fallback={
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-500">טוען...</p>
        </div>
      </div>
    }>
      <CreatePageContent />
    </Suspense>
  )
}
