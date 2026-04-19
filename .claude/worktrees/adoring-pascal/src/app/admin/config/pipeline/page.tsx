'use client'

import { useAdminConfig } from '@/components/admin/use-admin-config'
import ConfigTable from '@/components/admin/config-table'
import { Spinner } from '@/components/ui/spinner'

export default function PipelinePage() {
  const { configs, loading, error, saveMessage, saveConfig, restoreDefault } = useAdminConfig('pipeline')

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>
  if (error) return <div className="text-destructive text-sm py-8">{error}</div>

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-heebo font-bold text-foreground">Pipeline</h2>
          <p className="text-sm text-muted-foreground">מגבלות טוקנים, מספרי חתימה וגבולות עיבוד</p>
        </div>
        {saveMessage && (
          <span className="text-sm text-green-600 bg-green-50 px-3 py-1 rounded-full">
            {saveMessage}
          </span>
        )}
      </div>

      <ConfigTable
        items={configs}
        onSave={saveConfig}
        onRestore={restoreDefault}
      />
    </div>
  )
}
