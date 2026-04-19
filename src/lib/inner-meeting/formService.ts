import { createClient } from '@/lib/supabase/client'
import type {
  Contact,
  Form,
  FormActivityLog,
  FormParticipant,
  FormWithDetails,
  InnerMeetingForm,
  ParticipantRole,
} from './types'
import type { InnerMeetingFormData } from '@/types/inner-meeting'

const getClient = () => {
  if (typeof window === 'undefined') {
    throw new Error('inner-meeting formService is client-only')
  }
  return createClient()
}

const sanitizeText = (text: string): string => text.replace(/"/g, "'")

export async function createFormDraft(
  draftName: string,
): Promise<{ form: Form; innerForm: InnerMeetingForm } | null> {
  try {
    const supabase = getClient()
    const { data: form, error: formError } = await supabase
      .from('forms')
      .insert({ type: 'inner_meeting', status: 'draft', title: draftName })
      .select()
      .single()
    if (formError) throw formError

    const { data: innerForm, error: innerFormError } = await supabase
      .from('inner_meeting_forms')
      .insert({ form_id: form.id })
      .select()
      .single()
    if (innerFormError) throw innerFormError

    return { form, innerForm }
  } catch (error) {
    console.error('Error creating form draft:', error)
    return null
  }
}

export async function updateFormData(
  formId: string,
  innerFormId: string,
  data: Partial<InnerMeetingForm>,
): Promise<boolean> {
  try {
    const supabase = getClient()
    const { error: innerFormError } = await supabase
      .from('inner_meeting_forms')
      .update(data)
      .eq('id', innerFormId)
    if (innerFormError) throw innerFormError

    const formUpdate: Record<string, unknown> = {}
    if (data.client_name) formUpdate.title = data.client_name
    if (Object.keys(formUpdate).length > 0) {
      const { error: formError } = await supabase.from('forms').update(formUpdate).eq('id', formId)
      if (formError) throw formError
    }
    return true
  } catch (error) {
    console.error('Error updating form data:', error)
    return false
  }
}

export async function getFormByToken(token: string): Promise<FormWithDetails | null> {
  try {
    const supabase = getClient()
    const { data: form, error: formError } = await supabase
      .from('forms')
      .select('*')
      .eq('share_token', token)
      .single()
    if (formError) throw formError

    const { data: innerForm, error: innerFormError } = await supabase
      .from('inner_meeting_forms')
      .select('*')
      .eq('form_id', form.id)
      .single()
    if (innerFormError && innerFormError.code !== 'PGRST116') throw innerFormError

    const { data: participants, error: participantsError } = await supabase
      .from('form_participants')
      .select(`*, contact:contacts(*)`)
      .eq('form_id', form.id)
    if (participantsError) throw participantsError

    return {
      ...form,
      inner_meeting_form: innerForm ?? undefined,
      participants: (participants as unknown as Array<FormParticipant & { contact: Contact }>) || [],
    }
  } catch (error) {
    console.error('Error getting form by token:', error)
    return null
  }
}

export async function getForms(status?: 'draft' | 'completed'): Promise<FormWithDetails[]> {
  try {
    const supabase = getClient()
    let query = supabase
      .from('forms')
      .select(`*, inner_meeting_forms(*)`)
      .eq('type', 'inner_meeting')
      .order('created_at', { ascending: false })
    if (status) query = query.eq('status', status)
    const { data, error } = await query
    if (error) throw error
    return (data as unknown as FormWithDetails[]) || []
  } catch (error) {
    console.error('Error getting forms:', error)
    return []
  }
}

export async function updateFormParticipants(
  formId: string,
  participants: Array<{ contact_id: string; role: ParticipantRole }>,
): Promise<boolean> {
  try {
    const supabase = getClient()
    const roles = Array.from(new Set(participants.map((p) => p.role)))
    const { error: deleteError } = await supabase
      .from('form_participants')
      .delete()
      .eq('form_id', formId)
      .in('role', roles)
    if (deleteError) throw deleteError

    if (participants.length > 0) {
      const { error: insertError } = await supabase
        .from('form_participants')
        .insert(participants.map((p) => ({ form_id: formId, contact_id: p.contact_id, role: p.role })))
      if (insertError) throw insertError
    }
    return true
  } catch (error) {
    console.error('Error updating form participants:', error)
    return false
  }
}

export async function completeForm(
  formId: string,
  data: InnerMeetingFormData,
): Promise<boolean> {
  try {
    const webhookData: Record<string, unknown> = {
      clientName: sanitizeText(data.clientName),
      meetingDate: data.meetingDate,
      participants: data.participants.map((p) => ({
        name: sanitizeText(p.name),
        email: p.email,
        hebrewName: sanitizeText(p.hebrewName),
      })),
      creativeWriter: {
        name: sanitizeText(data.creativeWriter[0].name),
        email: data.creativeWriter[0].email,
        hebrewName: sanitizeText(data.creativeWriter[0].hebrewName),
      },
      presenter: {
        name: sanitizeText(data.presenter[0].name),
        email: data.presenter[0].email,
        hebrewName: sanitizeText(data.presenter[0].hebrewName),
      },
      presentationMaker: {
        name: sanitizeText(data.presentationMaker[0].name),
        email: data.presentationMaker[0].email,
        hebrewName: sanitizeText(data.presentationMaker[0].hebrewName),
      },
      accountManager: {
        name: sanitizeText(data.accountManager[0].name),
        email: data.accountManager[0].email,
        hebrewName: sanitizeText(data.accountManager[0].hebrewName),
      },
      aboutBrand: sanitizeText(data.aboutBrand),
      targetAudiences: sanitizeText(data.targetAudiences),
      goals: sanitizeText(data.goals),
      insight: sanitizeText(data.insight),
      strategy: sanitizeText(data.strategy),
      mediaStrategy: sanitizeText(data.mediaStrategy || ''),
      creative: sanitizeText(data.creative),
      creativePresentation: sanitizeText(data.creativePresentation || ''),
      influencersExample: sanitizeText(data.influencersExample || ''),
      additionalNotes: sanitizeText(data.additionalNotes || ''),
      budgetDistribution: sanitizeText(data.budgetDistribution || ''),
      creativeDeadline: data.creativeDeadline,
      internalDeadline: data.internalDeadline,
      clientDeadline: data.clientDeadline,
    }

    if (data.mediaPerson && data.mediaPerson.length > 0) {
      webhookData.mediaPerson = {
        name: sanitizeText(data.mediaPerson[0].name),
        email: data.mediaPerson[0].email,
        hebrewName: sanitizeText(data.mediaPerson[0].hebrewName),
      }
    }

    const response = await fetch(
      'https://hook.eu2.make.com/q840w368tibatfkrv9nx6sxtoqr2orm3',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookData),
      },
    )
    if (!response.ok) throw new Error('Webhook failed')

    const supabase = getClient()
    const { error } = await supabase.from('forms').update({ status: 'completed' }).eq('id', formId)
    if (error) throw error
    return true
  } catch (error) {
    console.error('Error completing form:', error)
    return false
  }
}

export async function getContacts(): Promise<Contact[]> {
  try {
    const supabase = getClient()
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .order('hebrew_first_name')
    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Error getting contacts:', error)
    return []
  }
}

export function subscribeToForm(formId: string, callback: (payload: unknown) => void) {
  const supabase = getClient()
  return supabase
    .channel(`form:${formId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'inner_meeting_forms',
        filter: `form_id=eq.${formId}`,
      },
      callback,
    )
    .subscribe()
}

export function subscribeToFormsList(callback: (payload: unknown) => void) {
  const supabase = getClient()
  return supabase
    .channel('forms_list')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'forms' }, callback)
    .subscribe()
}

export function unsubscribe(channel: unknown) {
  const supabase = getClient()
  supabase.removeChannel(channel as Parameters<typeof supabase.removeChannel>[0])
}

export async function logActivity(
  formId: string,
  userEmail: string,
  userName: string,
  actionType: 'save_draft' | 'submit',
): Promise<boolean> {
  try {
    const supabase = getClient()
    const { error } = await supabase.from('form_activity_logs').insert({
      form_id: formId,
      user_email: userEmail,
      user_name: userName,
      action_type: actionType,
    })
    if (error) throw error
    return true
  } catch (error) {
    console.error('Error logging activity:', error)
    return false
  }
}

export async function getFormActivityLogs(formId: string): Promise<FormActivityLog[]> {
  try {
    const supabase = getClient()
    const { data, error } = await supabase
      .from('form_activity_logs')
      .select('*')
      .eq('form_id', formId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Error getting activity logs:', error)
    return []
  }
}
