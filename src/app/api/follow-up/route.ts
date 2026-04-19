import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isDevMode } from '@/lib/auth/dev-mode'
import { addBusinessDays, formatIsraeliDate } from '@/lib/utils/israeli-business-days'

export const maxDuration = 15

/**
 * POST /api/follow-up
 *
 * Creates a Google Calendar event as a follow-up reminder.
 * The event has an email reminder so the user gets notified automatically.
 *
 * Body: {
 *   brandName: string      — the brand/client name
 *   proposalType: 'quote' | 'presentation'
 *   businessDays?: number  — days until reminder (default: 3)
 *   notes?: string         — optional notes for the reminder
 * }
 */
export async function POST(request: NextRequest) {
  const requestId = `followup-${Date.now()}`

  try {
    const supabase = await createClient()

    // Get user + Google token
    const { data: { session } } = await supabase.auth.getSession()

    if (!session?.user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const googleToken = session.provider_token
    if (!googleToken) {
      return NextResponse.json(
        { error: 'Google token expired. Please log out and log in again.' },
        { status: 401 },
      )
    }

    const userEmail = session.user.email || ''
    const userName = session.user.user_metadata?.full_name || session.user.user_metadata?.name || 'Leaders'

    const body = await request.json()
    const {
      brandName,
      proposalType = 'presentation',
      businessDays = 3,
      notes = '',
    } = body as {
      brandName: string
      proposalType?: 'quote' | 'presentation'
      businessDays?: number
      notes?: string
    }

    if (!brandName) {
      return NextResponse.json({ error: 'brandName is required' }, { status: 400 })
    }

    // Calculate follow-up date (3 Israeli business days from now)
    const now = new Date()
    const followUpDate = addBusinessDays(now, businessDays)

    // Set the event at 10:00 AM Israel time
    followUpDate.setHours(10, 0, 0, 0)
    const endDate = new Date(followUpDate)
    endDate.setHours(10, 30, 0, 0) // 30 min event

    const typeHebrew = proposalType === 'quote' ? 'הצעת מחיר' : 'מצגת קריאטיבית'
    const formattedDate = formatIsraeliDate(followUpDate)

    const eventTitle = `פולואפ: ${typeHebrew} — ${brandName}`
    const eventDescription = `תזכורת פולואפ אוטומטית מ-Leaders

${typeHebrew} נשלחה ל-${brandName} ב-${formatIsraeliDate(now)}.

${businessDays} ימי עסקים עברו — זה הזמן לעשות פולואפ!

${notes ? `הערות: ${notes}` : ''}

---
נוצר אוטומטית על ידי Leaders PPT Maker`

    console.log(`[${requestId}] Creating follow-up for "${brandName}" on ${formattedDate}`)

    // Create Google Calendar event via REST API
    const calendarEvent = {
      summary: eventTitle,
      description: eventDescription,
      start: {
        dateTime: followUpDate.toISOString(),
        timeZone: 'Asia/Jerusalem',
      },
      end: {
        dateTime: endDate.toISOString(),
        timeZone: 'Asia/Jerusalem',
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 0 },      // Email at event time
          { method: 'popup', minutes: 0 },       // Popup at event time
          { method: 'email', minutes: 60 },      // Email 1 hour before
        ],
      },
      colorId: '11', // Red (Tomato) — stands out
      attendees: userEmail ? [{ email: userEmail, self: true }] : [],
    }

    const calRes = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=none',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${googleToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(calendarEvent),
      },
    )

    if (!calRes.ok) {
      const errText = await calRes.text()
      console.error(`[${requestId}] Calendar API error (${calRes.status}):`, errText)

      if (calRes.status === 401 || calRes.status === 403) {
        return NextResponse.json(
          { error: 'Google Calendar access denied. Please log out and log in again to grant calendar permission.' },
          { status: 401 },
        )
      }

      return NextResponse.json(
        { error: `Calendar API error: ${calRes.status}` },
        { status: 500 },
      )
    }

    const createdEvent = await calRes.json()
    console.log(`[${requestId}] ✅ Follow-up created: ${createdEvent.htmlLink}`)

    return NextResponse.json({
      success: true,
      followUpDate: followUpDate.toISOString(),
      formattedDate,
      eventLink: createdEvent.htmlLink,
      message: `תזכורת פולואפ נקבעה ל-${formattedDate}`,
    })
  } catch (error) {
    console.error(`[${requestId}] Error:`, error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create follow-up' },
      { status: 500 },
    )
  }
}
