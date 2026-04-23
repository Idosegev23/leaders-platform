/**
 * Unified event for the dashboard's Live Hub Feed.
 * Maps multiple source tables (leads, document_links, forms,
 * inner_meeting_forms, documents) into a single display shape.
 */

export type HubEventKind =
  | 'lead_new'
  | 'lead_contacted'
  | 'lead_converted'
  | 'brief_sent'
  | 'brief_opened'
  | 'brief_progress'
  | 'brief_completed'
  | 'kickoff_draft'
  | 'kickoff_editing'
  | 'kickoff_submitted'
  | 'document_created'
  | 'document_completed'

export type HubEventSource =
  | 'leads'
  | 'document_links'
  | 'forms'
  | 'documents'

export type HubEvent = {
  id: string                    // stable React key
  kind: HubEventKind
  source_table: HubEventSource
  source_id: string
  title: string                 // primary line (client / lead / document title)
  subtitle: string | null       // short status ("שלב 3/6", "2 עורכים", "נפתח")
  actor_email: string | null
  actor_name: string | null
  href: string | null
  status: string                // for the dot color
  timestamp: string             // ISO — used for sort + relative display
  progress?: { step: number; total: number } | null
  active_editors?: number
}
