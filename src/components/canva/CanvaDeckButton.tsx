// src/components/canva/CanvaDeckButton.tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui'

/**
 * "פתח/צור מצגת ב-Canva" — imports the generated deck into Canva via
 * /api/canva/import, then reveals the returned edit link. Note: Canva edit
 * links expire ~30 days out; re-clicking re-imports and refreshes the link.
 */
export function CanvaDeckButton({
  documentId,
  initialEditUrl,
}: {
  documentId: string
  initialEditUrl?: string | null
}) {
  const [editUrl, setEditUrl] = useState<string | null>(initialEditUrl ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runImport = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/canva/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId }),
      })
      const json = await res.json()
      if (!res.ok || !json?.edit_url) {
        throw new Error(json?.error || 'ייבוא ל-Canva נכשל')
      }
      setEditUrl(json.edit_url as string)
      window.open(json.edit_url as string, '_blank', 'noopener')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בייבוא ל-Canva')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {editUrl ? (
        <div className="flex items-center gap-2">
          <a href={editUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="secondary">🎨 פתח ב-Canva</Button>
          </a>
          <Button variant="ghost" size="sm" onClick={runImport} disabled={busy}>
            {busy ? '...מרענן' : 'רענן קישור'}
          </Button>
        </div>
      ) : (
        <Button variant="secondary" onClick={runImport} disabled={busy}>
          {busy ? '...מייבא ל-Canva' : '🎨 צור מצגת ב-Canva'}
        </Button>
      )}
      {error && <span className="text-xs text-red-600 max-w-[240px] text-left">{error}</span>}
    </div>
  )
}
