'use client'

import { useAdminConfig } from '@/components/admin/use-admin-config'
import ConfigTable from '@/components/admin/config-table'
import { Spinner } from '@/components/ui/spinner'

export default function FlagsPage() {
  const { configs, loading, error, saveMessage, saveConfig, restoreDefault } = useAdminConfig('feature_flags')

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>
  if (error) return <div className="text-destructive text-sm py-8">{error}</div>

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-heebo font-bold text-foreground">Feature Flags</h2>
          <p className="text-sm text-muted-foreground">הפעלה וכיבוי של יכולות מערכת</p>
        </div>
        {saveMessage && (
          <span className="text-sm text-green-600 bg-green-50 px-3 py-1 rounded-full">
            {saveMessage}
          </span>
        )}
      </div>

      {configs.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-wizard-border p-8 text-center">
          <p className="text-sm text-muted-foreground">אין feature flags מוגדרים עדיין</p>
        </div>
      ) : (
        <ConfigTable
          items={configs}
          onSave={saveConfig}
          onRestore={restoreDefault}
        />
      )}
    </div>
  )
}
