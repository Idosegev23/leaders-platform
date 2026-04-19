'use client'

import { useAdminConfig } from '@/components/admin/use-admin-config'
import PromptEditor from '@/components/admin/prompt-editor'
import { Spinner } from '@/components/ui/spinner'

export default function ModelsPage() {
  const { configs, loading, error, saveMessage, saveConfig, restoreDefault } = useAdminConfig('ai_models')

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>
  if (error) return <div className="text-destructive text-sm py-8">{error}</div>

  // Group by agent
  const groups = new Map<string, typeof configs>()
  for (const config of configs) {
    const group = config.group || 'כללי'
    if (!groups.has(group)) groups.set(group, [])
    groups.get(group)!.push(config)
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-heebo font-bold text-foreground">מודלי AI</h2>
          <p className="text-sm text-muted-foreground">בחירת מודל, רמת חשיבה וטוקנים לכל סוכן</p>
        </div>
        {saveMessage && (
          <span className="text-sm text-green-600 bg-green-50 px-3 py-1 rounded-full">
            {saveMessage}
          </span>
        )}
      </div>

      {Array.from(groups.entries()).map(([groupName, groupConfigs]) => (
        <div key={groupName} className="space-y-3">
          <h3 className="text-sm font-heebo font-semibold text-wizard-text-secondary flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-accent" />
            {groupName}
          </h3>
          <div className="space-y-2">
            {groupConfigs.map((config) => (
              <PromptEditor
                key={config.key}
                configKey={config.key}
                description={config.description}
                value={typeof config.value === 'string' ? config.value : String(config.value)}
                defaultValue={typeof config.defaultValue === 'string' ? config.defaultValue : String(config.defaultValue)}
                isOverridden={config.isOverridden}
                updatedAt={config.updatedAt}
                onSave={async (key, val) => {
                  // Try parsing as number for token limits
                  const num = Number(val)
                  await saveConfig(key, isNaN(num) ? val : num)
                }}
                onRestore={restoreDefault}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
