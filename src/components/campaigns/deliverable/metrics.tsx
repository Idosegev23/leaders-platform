'use client'

import * as React from 'react'
import { api } from '../client-api'
import { AssetViewer, Uploader } from '../uploader'
import { Btn, Field, Notice, SelectInput, TextInput, useAction } from '../ui'
import { HE_METRIC, METRIC_NAMES, type MetricName } from '@/lib/campaigns/domain/report-metrics'
import { formatDateTime, toJerusalemInput } from '@/lib/campaigns/domain/time'

type Obs = { id: string; metric_name: string; metric_value: string; source_type: string; captured_at: string; measurement_period: string; evidence_asset_id: string | null }
const SOURCE_HE: Record<string, string> = { creator_reported: 'דיווח יוצר', manager_entered: 'הזנה ידנית (צוות)', platform_export: 'ייצוא מהפלטפורמה' }

export function MetricsTable({ metrics, apiBase }: { metrics: Obs[]; apiBase: '/api/campaigns' | '/api/portal' }) {
  if (metrics.length === 0) return <p className="text-sm text-wizard-text-secondary">לא הוזנו נתוני ביצועים. נתון שלא הוזן מוצג כחסר ולא כאפס.</p>
  const latest = new Map<string, Obs>()
  for (const m of metrics) if (!latest.has(m.metric_name)) latest.set(m.metric_name, m)
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {METRIC_NAMES.map((n) => {
          const m = latest.get(n)
          return (
            <div key={n} className="rounded-lg border border-wizard-border p-2 text-sm">
              <div className="text-xs text-wizard-text-secondary">{HE_METRIC[n]}</div>
              <div className="font-bold">{m ? Number(m.metric_value).toLocaleString('he-IL') : <span className="font-normal text-wizard-text-tertiary">חסר</span>}</div>
              {m && <div className="text-[11px] text-wizard-text-secondary">{SOURCE_HE[m.source_type]} · {formatDateTime(m.captured_at)}</div>}
            </div>
          )
        })}
      </div>
      <details className="text-xs">
        <summary className="cursor-pointer text-wizard-text-secondary">כל המדידות ({metrics.length})</summary>
        <ul className="mt-1 space-y-1">
          {metrics.map((m) => (
            <li key={m.id}>
              {HE_METRIC[m.metric_name as MetricName] ?? m.metric_name}: {Number(m.metric_value).toLocaleString('he-IL')} · {SOURCE_HE[m.source_type]} · תקופה {m.measurement_period} · {formatDateTime(m.captured_at)}
              {m.evidence_asset_id && <span className="ms-2 inline-block"><AssetViewer apiBase={apiBase} assetId={m.evidence_asset_id} mime={null} name="אסמכתה" /></span>}
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}

export function MetricsForm({ apiBase, deliverableId, participationId, internal }: { apiBase: '/api/campaigns' | '/api/portal'; deliverableId: string; participationId: string; internal?: boolean }) {
  const [values, setValues] = React.useState<Record<string, string>>({})
  const [captured, setCaptured] = React.useState(toJerusalemInput(new Date()))
  const [period, setPeriod] = React.useState('lifetime')
  const [source, setSource] = React.useState('manager_entered')
  const [evidence, setEvidence] = React.useState<{ id: string } | null>(null)
  const [key, setKey] = React.useState(0)
  const { busy, run } = useAction()
  const filled = Object.values(values).filter((v) => v.trim() !== '').length
  const invalid = Object.entries(values).filter(([, v]) => v.trim() !== '' && !/^\d[\d,]*$/.test(v.trim()))
  return (
    <form key={key} className="space-y-3 rounded-xl border border-wizard-border p-3" onSubmit={async (e) => {
      e.preventDefault()
      const ok = await run(() => api(`${apiBase}/deliverables/${deliverableId}/metrics`, { body: {
        captured_at: captured, measurement_period: period, source_type: internal ? source : undefined, evidence_asset_id: evidence?.id ?? null,
        values: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.trim() === '' ? null : v.replace(/,/g, '')])),
      } }), { success: 'הנתונים נשמרו' })
      if (ok) { setValues({}); setEvidence(null); setKey((k) => k + 1) }
    }}>
      <h3 className="font-semibold">הזנת נתוני ביצועים</h3>
      <Notice>מלאו רק נתונים שיש לכם. שדה ריק = לא ידוע (לא נשמר כאפס). אפס הוא ערך תקין.</Notice>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {METRIC_NAMES.map((n) => (
          <Field key={n} label={HE_METRIC[n]} htmlFor={`m-${n}-${deliverableId}`} error={invalid.some(([k]) => k === n) ? 'מספר שלם בלבד' : undefined}>
            <TextInput id={`m-${n}-${deliverableId}`} inputMode="numeric" dir="ltr" value={values[n] ?? ''} onChange={(e) => setValues({ ...values, [n]: e.target.value })} />
          </Field>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Field label="נאסף ב (שעון ישראל)" htmlFor={`m-cap-${deliverableId}`}><TextInput id={`m-cap-${deliverableId}`} type="datetime-local" value={captured} onChange={(e) => setCaptured(e.target.value)} /></Field>
        <Field label="תקופת מדידה" htmlFor={`m-per-${deliverableId}`}><SelectInput id={`m-per-${deliverableId}`} value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="24h">24 שעות</option><option value="48h">48 שעות</option><option value="7d">7 ימים</option><option value="14d">14 ימים</option><option value="30d">30 ימים</option><option value="lifetime">מצטבר</option>
        </SelectInput></Field>
        {internal && <Field label="מקור" htmlFor={`m-src-${deliverableId}`}><SelectInput id={`m-src-${deliverableId}`} value={source} onChange={(e) => setSource(e.target.value)}><option value="manager_entered">הזנה ידנית</option><option value="platform_export">ייצוא מהפלטפורמה</option></SelectInput></Field>}
      </div>
      <Uploader apiBase={apiBase} participationId={participationId} purpose="metric_evidence" onReady={(a) => setEvidence(a)} label="צילום מסך מהסטטיסטיקות (מומלץ)" />
      <Btn type="submit" busy={busy} disabled={filled === 0 || invalid.length > 0}>שמירת {filled} נתונים</Btn>
    </form>
  )
}
