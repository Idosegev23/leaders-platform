'use client'

import { useState, useEffect, useMemo } from 'react'
import { useAdminConfig } from './use-admin-config'

const MODELS_BY_PROVIDER: Record<string, { value: string; label: string }[]> = {
  openai: [
    { value: 'gpt-5.2-pro-2025-12-11', label: 'GPT-5.2 Pro' },
    { value: 'gpt-5.2-2025-12-11', label: 'GPT-5.2' },
  ],
  gemini: [
    { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (Preview)' },
    { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (Preview)' },
  ],
  claude: [
    { value: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
  ],
}

function getProviderFromModel(modelId: string): string {
  if (modelId.startsWith('gpt') || modelId.startsWith('o1') || modelId.startsWith('o3')) return 'openai'
  if (modelId.startsWith('claude')) return 'claude'
  return 'gemini'
}

export default function GlobalModelSelector() {
  const { configs, loading, saveConfig, saveMessage } = useAdminConfig('ai_models')

  const globalConfigs = useMemo(() => {
    const map: Record<string, unknown> = {}
    for (const c of configs) {
      if (c.key.startsWith('global.')) {
        map[c.key] = c.value
      }
    }
    return map
  }, [configs])

  const [primaryModel, setPrimaryModel] = useState('')
  const [fallbackModel, setFallbackModel] = useState('')
  const [overrideAgents, setOverrideAgents] = useState(true)

  useEffect(() => {
    if (configs.length === 0) return
    setPrimaryModel(String(globalConfigs['global.primary_model'] || 'gpt-5.2-pro-2025-12-11'))
    setFallbackModel(String(globalConfigs['global.fallback_model'] || 'gpt-5.2-2025-12-11'))
    setOverrideAgents(globalConfigs['global.override_agents'] !== false)
  }, [configs, globalConfigs])

  const primaryProvider = getProviderFromModel(primaryModel)
  const fallbackProvider = getProviderFromModel(fallbackModel)

  const handleSavePrimary = async (modelId: string) => {
    setPrimaryModel(modelId)
    await saveConfig('global.primary_model', modelId)
  }

  const handleSaveFallback = async (modelId: string) => {
    setFallbackModel(modelId)
    await saveConfig('global.fallback_model', modelId)
  }

  const handleToggleOverride = async () => {
    const newVal = !overrideAgents
    setOverrideAgents(newVal)
    await saveConfig('global.override_agents', newVal)
  }

  if (loading) return null

  const noGoogleSearch = primaryProvider !== 'gemini'

  return (
    <div className="rounded-2xl border border-wizard-border bg-gradient-to-br from-white to-brand-pearl/30 p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-heebo font-bold text-foreground">בחירת מודל גלובלי</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            המודל הנבחר ישמש את כל הסוכנים במערכת
          </p>
        </div>
        {saveMessage && (
          <span className="text-xs text-green-600 bg-green-50 px-2.5 py-1 rounded-full">
            {saveMessage}
          </span>
        )}
      </div>

      {/* Primary Model */}
      <div className="grid grid-cols-[140px_1fr] gap-3 items-center">
        <label className="text-sm font-heebo font-semibold text-wizard-text-secondary">
          מודל ראשי
        </label>
        <div className="flex gap-2">
          <select
            value={primaryProvider}
            onChange={(e) => {
              const provider = e.target.value
              const firstModel = MODELS_BY_PROVIDER[provider]?.[0]?.value || ''
              handleSavePrimary(firstModel)
            }}
            className="h-10 rounded-xl border border-wizard-border bg-white px-3 text-sm appearance-none cursor-pointer hover:border-primary/20 transition-colors min-w-[140px]"
          >
            <option value="openai">OpenAI</option>
            <option value="gemini">Google Gemini</option>
            <option value="claude">Anthropic Claude</option>
          </select>
          <select
            value={primaryModel}
            onChange={(e) => handleSavePrimary(e.target.value)}
            className="h-10 rounded-xl border border-wizard-border bg-white px-3 text-sm appearance-none cursor-pointer hover:border-primary/20 transition-colors flex-1"
          >
            {(MODELS_BY_PROVIDER[primaryProvider] || []).map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Fallback Model */}
      <div className="grid grid-cols-[140px_1fr] gap-3 items-center">
        <label className="text-sm font-heebo font-semibold text-wizard-text-secondary">
          מודל גיבוי
        </label>
        <div className="flex gap-2">
          <select
            value={fallbackProvider}
            onChange={(e) => {
              const provider = e.target.value
              const firstModel = MODELS_BY_PROVIDER[provider]?.[0]?.value || ''
              handleSaveFallback(firstModel)
            }}
            className="h-10 rounded-xl border border-wizard-border bg-white px-3 text-sm appearance-none cursor-pointer hover:border-primary/20 transition-colors min-w-[140px]"
          >
            <option value="openai">OpenAI</option>
            <option value="gemini">Google Gemini</option>
            <option value="claude">Anthropic Claude</option>
          </select>
          <select
            value={fallbackModel}
            onChange={(e) => handleSaveFallback(e.target.value)}
            className="h-10 rounded-xl border border-wizard-border bg-white px-3 text-sm appearance-none cursor-pointer hover:border-primary/20 transition-colors flex-1"
          >
            {(MODELS_BY_PROVIDER[fallbackProvider] || []).map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Override toggle */}
      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={handleToggleOverride}
          className={`relative w-10 h-5 rounded-full transition-colors ${
            overrideAgents ? 'bg-accent' : 'bg-gray-300'
          }`}
        >
          <span
            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
              overrideAgents ? 'right-0.5' : 'right-[calc(100%-18px)]'
            }`}
          />
        </button>
        <span className="text-sm text-wizard-text-secondary">
          דריסת הגדרות סוכנים — כל הסוכנים ישתמשו במודל הגלובלי
        </span>
      </div>

      {/* Capability warnings */}
      {noGoogleSearch && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 space-y-1">
          <p className="font-semibold">שים לב — מגבלות {primaryProvider === 'claude' ? 'Claude' : 'OpenAI'}:</p>
          <ul className="list-disc list-inside space-y-0.5 mr-1">
            <li>חיפוש Google לא זמין — מחקר מותג ומשפיענים יתבסס על ידע קיים בלבד</li>
          </ul>
        </div>
      )}
    </div>
  )
}
