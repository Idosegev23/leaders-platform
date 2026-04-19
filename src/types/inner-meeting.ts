import { z } from 'zod'

export interface Contact {
  firstName: string
  lastName: string
  hebrewFirstName: string
  hebrewLastName: string
  email: string
}

export interface SelectedPerson {
  name: string
  email: string
  hebrewName: string
}

const personSchema = z.object({
  name: z.string(),
  email: z.string(),
  hebrewName: z.string(),
})

export const innerMeetingSchema = z.object({
  clientName: z.string().min(1, 'שדה חובה'),
  meetingDate: z.string().min(1, 'שדה חובה'),
  participants: z.array(personSchema).min(1, 'יש לבחור לפחות משתתף אחד'),
  creativeWriter: z.array(personSchema).min(1, 'שדה חובה'),
  presenter: z.array(personSchema).min(1, 'שדה חובה'),
  presentationMaker: z.array(personSchema).min(1, 'שדה חובה'),
  accountManager: z.array(personSchema).min(1, 'שדה חובה'),
  mediaPerson: z.array(personSchema).optional(),
  aboutBrand: z.string().min(1, 'שדה חובה'),
  targetAudiences: z.string().min(1, 'שדה חובה'),
  goals: z.string().min(1, 'שדה חובה'),
  insight: z.string().min(1, 'שדה חובה'),
  strategy: z.string().min(1, 'שדה חובה'),
  mediaStrategy: z.string().optional(),
  creative: z.string().min(1, 'שדה חובה'),
  creativePresentation: z.string().optional(),
  influencersExample: z.string().optional(),
  additionalNotes: z.string().optional(),
  budgetDistribution: z.string().optional(),
  creativeDeadline: z.string().min(1, 'שדה חובה'),
  internalDeadline: z.string().min(1, 'שדה חובה'),
  clientDeadline: z.string().min(1, 'שדה חובה'),
})

export type InnerMeetingFormData = z.infer<typeof innerMeetingSchema>
