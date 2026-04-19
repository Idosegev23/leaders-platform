'use client'

import { useAdminConfig } from '@/components/admin/use-admin-config'
import PromptEditor from '@/components/admin/prompt-editor'
import JsonEditor from '@/components/admin/json-editor'
import { Spinner } from '@/components/ui/spinner'

export default function DesignPage() {
  const { configs, loading, error, saveMessage, saveConfig, restoreDefault } = useAdminConfig('design_system')

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>
  if (error) return <div className="text-destructive text-sm py-8">{error}</div>

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-heebo font-bold text-foreground">מערכת עיצוב</h2>
          <p className="text-sm text-muted-foreground">עיצוב שקפים — ארכיטיפים, קצב, חוקי קומפוזיציה</p>
        </div>
        {saveMessage && (
          <span className="text-sm text-green-600 bg-green-50 px-3 py-1 rounded-full">
            {saveMessage}
          </span>
        )}
      </div>

      <div className="space-y-3">
        {configs.map((config) =>
          config.value_type === 'json' ? (
            <JsonEditor
              key={config.key}
              configKey={config.key}
              description={config.description}
              value={config.value}
              defaultValue={config.defaultValue}
              isOverridden={config.isOverridden}
              updatedAt={config.updatedAt}
              onSave={saveConfig}
              onRestore={restoreDefault}
            />
          ) : (
            <PromptEditor
              key={config.key}
              configKey={config.key}
              description={config.description}
              value={typeof config.value === 'string' ? config.value : JSON.stringify(config.value)}
              defaultValue={typeof config.defaultValue === 'string' ? config.defaultValue : JSON.stringify(config.defaultValue)}
              isOverridden={config.isOverridden}
              updatedAt={config.updatedAt}
              onSave={saveConfig}
              onRestore={restoreDefault}
            />
          )
        )}
      </div>
    </div>
  )
}
