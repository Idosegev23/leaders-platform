// Database row shapes for the inner-meeting module.
// Mirrors the tables created by supabase/migrations/20260419_init_hub_schema.sql.

export interface Contact {
  id: string
  first_name: string
  last_name: string
  hebrew_first_name: string
  hebrew_last_name: string
  email: string
  created_at: string
  updated_at: string
}

export interface Form {
  id: string
  type: string
  status: 'draft' | 'completed' | 'archived'
  title: string | null
  share_token: string
  active_editors_count: number
  created_at: string
  updated_at: string
}

export interface InnerMeetingForm {
  id: string
  form_id: string
  folder_id: string | null
  client_name: string | null
  meeting_date: string | null
  about_brand: string | null
  target_audiences: string | null
  goals: string | null
  insight: string | null
  strategy: string | null
  creative: string | null
  creative_presentation: string | null
  media_strategy: string | null
  influencers_example: string | null
  additional_notes: string | null
  budget_distribution: string | null
  creative_deadline: string | null
  internal_deadline: string | null
  client_deadline: string | null
  created_at: string
  updated_at: string
}

export type ParticipantRole =
  | 'participant'
  | 'creative_writer'
  | 'presenter'
  | 'presentation_maker'
  | 'account_manager'
  | 'media_person'

export interface FormParticipant {
  id: string
  form_id: string
  contact_id: string
  role: ParticipantRole
  created_at: string
}

export interface FormActivityLog {
  id: string
  form_id: string
  user_email: string
  user_name: string | null
  action_type: 'save_draft' | 'submit'
  created_at: string
}

export interface FormWithDetails extends Form {
  inner_meeting_form?: InnerMeetingForm
  inner_meeting_forms?: InnerMeetingForm[]
  participants?: Array<FormParticipant & { contact: Contact }>
}
