/**
 * POST /api/research/save-to-drive
 *
 * Saves the brand research from a document as a Google Doc in the user's
 * personal Drive (using their OAuth provider_token — NOT a service account).
 *
 * Body: { documentId }
 * Returns: { fileId, webViewLink, fileName }
 *
 * Flow:
 * 1. Load document from Supabase
 * 2. Get user's Google OAuth token (provider_token from Supabase auth)
 * 3. Build HTML from _brandResearch + _influencerStrategy
 * 4. POST to Google Drive with mimeType: application/vnd.google-apps.document
 *    → Google converts HTML to a formatted Doc automatically
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isDevMode, DEV_AUTH_USER } from '@/lib/auth/dev-mode'

export const maxDuration = 60
export const runtime = 'nodejs'

interface BrandResearch {
  brandName?: string
  officialName?: string
  industry?: string
  marketPosition?: string
  companyDescription?: string
  founded?: string
  website?: string
  pricePositioning?: string
  competitors?: Array<{ name: string; description?: string; differentiator?: string }>
  uniqueSellingPoints?: string[]
  brandPersonality?: string[]
  brandValues?: string[]
  targetDemographics?: {
    primaryAudience?: {
      gender?: string
      ageRange?: string
      socioeconomic?: string
      lifestyle?: string
      interests?: string[]
      painPoints?: string[]
    }
  }
  toneOfVoice?: string
  dominantPlatformInIsrael?: string
  previousCampaigns?: Array<{ name: string; description?: string }>
  industryTrends?: string[]
  suggestedApproach?: string
  israeliMarketContext?: string
  sources?: Array<{ title: string; url?: string }>
  confidence?: string
}

interface InfluencerStrategy {
  strategySummary?: string
  recommendations?: Array<{
    name?: string
    handle?: string
    followers?: string
    engagement?: string
    whyRelevant?: string
  }>
}

function buildResearchHtml(
  brandName: string,
  research: BrandResearch | null,
  influencers: InfluencerStrategy | null,
  createdAt: string,
): string {
  const esc = (s: string | undefined | null): string => {
    if (!s) return ''
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }

  const section = (title: string, body: string): string => {
    if (!body.trim()) return ''
    return `<h2>${esc(title)}</h2>${body}`
  }

  const list = (items: string[] | undefined): string => {
    if (!items?.length) return ''
    return `<ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`
  }

  const parts: string[] = []

  // Header
  parts.push(`<h1>${esc(brandName)} — מחקר מותג</h1>`)
  parts.push(`<p><em>נוצר ע"י Leaders AI ב-${esc(createdAt)}</em></p>`)

  if (research) {
    // Basic info
    const basic: string[] = []
    if (research.officialName) basic.push(`<p><strong>שם רשמי:</strong> ${esc(research.officialName)}</p>`)
    if (research.industry) basic.push(`<p><strong>תעשייה:</strong> ${esc(research.industry)}</p>`)
    if (research.founded) basic.push(`<p><strong>שנת הקמה:</strong> ${esc(research.founded)}</p>`)
    if (research.website) basic.push(`<p><strong>אתר:</strong> <a href="${esc(research.website)}">${esc(research.website)}</a></p>`)
    if (research.pricePositioning) basic.push(`<p><strong>מיצוב מחיר:</strong> ${esc(research.pricePositioning)}</p>`)
    if (research.confidence) basic.push(`<p><strong>רמת ביטחון:</strong> ${esc(research.confidence)}</p>`)
    parts.push(section('מידע בסיסי', basic.join('')))

    // Company description
    if (research.companyDescription) {
      parts.push(section('תיאור המותג', `<p>${esc(research.companyDescription)}</p>`))
    }

    // Market position
    if (research.marketPosition) {
      parts.push(section('מיקום בשוק', `<p>${esc(research.marketPosition)}</p>`))
    }

    // Israeli market
    if (research.israeliMarketContext) {
      parts.push(section('הקשר שוק ישראלי', `<p>${esc(research.israeliMarketContext)}</p>`))
    }
    if (research.dominantPlatformInIsrael) {
      parts.push(`<p><strong>פלטפורמה דומיננטית בישראל:</strong> ${esc(research.dominantPlatformInIsrael)}</p>`)
    }

    // Brand identity
    if (research.brandPersonality?.length) {
      parts.push(section('אישיות המותג', list(research.brandPersonality)))
    }
    if (research.brandValues?.length) {
      parts.push(section('ערכי המותג', list(research.brandValues)))
    }
    if (research.toneOfVoice) {
      parts.push(section('טון דיבור', `<p>${esc(research.toneOfVoice)}</p>`))
    }

    // USPs
    if (research.uniqueSellingPoints?.length) {
      parts.push(section('יתרונות ייחודיים', list(research.uniqueSellingPoints)))
    }

    // Target audience
    const audience = research.targetDemographics?.primaryAudience
    if (audience) {
      const audParts: string[] = []
      if (audience.gender) audParts.push(`<p><strong>מגדר:</strong> ${esc(audience.gender)}</p>`)
      if (audience.ageRange) audParts.push(`<p><strong>טווח גילאים:</strong> ${esc(audience.ageRange)}</p>`)
      if (audience.socioeconomic) audParts.push(`<p><strong>רמה סוציו-אקונומית:</strong> ${esc(audience.socioeconomic)}</p>`)
      if (audience.lifestyle) audParts.push(`<p><strong>אורח חיים:</strong> ${esc(audience.lifestyle)}</p>`)
      if (audience.interests?.length) {
        audParts.push(`<p><strong>תחומי עניין:</strong></p>${list(audience.interests)}`)
      }
      if (audience.painPoints?.length) {
        audParts.push(`<p><strong>כאבים:</strong></p>${list(audience.painPoints)}`)
      }
      parts.push(section('קהל יעד', audParts.join('')))
    }

    // Competitors
    if (research.competitors?.length) {
      const compParts = research.competitors.map(c => {
        let html = `<h3>${esc(c.name)}</h3>`
        if (c.description) html += `<p>${esc(c.description)}</p>`
        if (c.differentiator) html += `<p><em>מה מבדיל: ${esc(c.differentiator)}</em></p>`
        return html
      }).join('')
      parts.push(section('מתחרים', compParts))
    }

    // Previous campaigns
    if (research.previousCampaigns?.length) {
      const campParts = research.previousCampaigns.map(c => {
        let html = `<p><strong>${esc(c.name)}</strong></p>`
        if (c.description) html += `<p>${esc(c.description)}</p>`
        return html
      }).join('')
      parts.push(section('קמפיינים קודמים', campParts))
    }

    // Industry trends
    if (research.industryTrends?.length) {
      parts.push(section('טרנדים בתעשייה', list(research.industryTrends)))
    }

    // Suggested approach
    if (research.suggestedApproach) {
      parts.push(section('גישה אסטרטגית מומלצת', `<p>${esc(research.suggestedApproach)}</p>`))
    }

    // Sources
    if (research.sources?.length) {
      const sourceParts = research.sources.map(s => {
        if (s.url) return `<li><a href="${esc(s.url)}">${esc(s.title || s.url)}</a></li>`
        return `<li>${esc(s.title)}</li>`
      }).join('')
      parts.push(section('מקורות', `<ul>${sourceParts}</ul>`))
    }
  } else {
    parts.push('<p><em>לא נמצא מחקר מותג מובנה.</em></p>')
  }

  // Influencers
  if (influencers?.recommendations?.length) {
    parts.push('<h2>אסטרטגיית משפיענים</h2>')
    if (influencers.strategySummary) {
      parts.push(`<p>${esc(influencers.strategySummary)}</p>`)
    }
    const infParts = influencers.recommendations.map(i => {
      let html = `<h3>${esc(i.name || i.handle || 'משפיען')}</h3>`
      if (i.handle) html += `<p><strong>@${esc(i.handle.replace('@', ''))}</strong></p>`
      if (i.followers) html += `<p><strong>עוקבים:</strong> ${esc(i.followers)}</p>`
      if (i.engagement) html += `<p><strong>Engagement:</strong> ${esc(i.engagement)}</p>`
      if (i.whyRelevant) html += `<p>${esc(i.whyRelevant)}</p>`
      return html
    }).join('')
    parts.push(infParts)
  }

  parts.push('<hr/>')
  parts.push('<p><em>מסמך זה נוצר אוטומטית ע"י Leaders AI.</em></p>')

  // Wrap in full HTML doc with RTL + Hebrew font hints
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>${esc(brandName)} — מחקר מותג</title>
</head>
<body dir="rtl" style="font-family: Arial, sans-serif; line-height: 1.6;">
${parts.join('\n')}
</body>
</html>`
}

export async function POST(request: NextRequest) {
  const requestId = `save-drive-${Date.now()}`
  console.log(`[${requestId}] ═══════════════════════════════════════`)
  console.log(`[${requestId}] 📁 SAVE-TO-DRIVE — START`)

  try {
    const supabase = await createClient()

    // Get user session + provider_token (Google OAuth)
    let providerToken: string | null = null
    let userId = DEV_AUTH_USER.id

    if (!isDevMode) {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      userId = session.user.id
      providerToken = session.provider_token || null
      if (!providerToken) {
        return NextResponse.json(
          { error: 'No Google access token. Please sign out and sign in again.' },
          { status: 403 },
        )
      }
    } else {
      // Dev mode — no real Drive save
      return NextResponse.json({ error: 'Drive save requires production auth' }, { status: 501 })
    }

    const { documentId } = await request.json()
    if (!documentId) {
      return NextResponse.json({ error: 'documentId required' }, { status: 400 })
    }

    // Load document
    const { data: doc, error: docErr } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single()

    if (docErr || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }
    if (doc.user_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const data = doc.data as Record<string, unknown>
    const brandName = (data.brandName as string) || 'Unknown Brand'
    const research = (data._brandResearch as BrandResearch) || null
    const influencers = (data._influencerStrategy as InfluencerStrategy) || null

    console.log(`[${requestId}] 📄 Document: ${documentId}, brand: "${brandName}"`)
    console.log(`[${requestId}]    research: ${research ? 'YES' : 'NO'}, influencers: ${influencers?.recommendations?.length || 0}`)

    // Build HTML
    const html = buildResearchHtml(
      brandName,
      research,
      influencers,
      new Date().toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' }),
    )
    console.log(`[${requestId}] 📝 HTML built: ${html.length} chars`)

    // Upload to Drive as Google Doc — Drive converts HTML to native Doc
    const fileName = `${brandName} — מחקר מותג (${new Date().toLocaleDateString('en-CA')})`

    // Multipart upload to Drive API — create Google Doc from HTML
    const boundary = `boundary_${Date.now()}`
    const metadata = {
      name: fileName,
      mimeType: 'application/vnd.google-apps.document', // Google Doc (not HTML file)
    }

    const multipartBody = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(metadata),
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      '',
      html,
      `--${boundary}--`,
    ].join('\r\n')

    console.log(`[${requestId}] 🚀 Uploading to Drive as Google Doc...`)
    const t0 = Date.now()
    const driveRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${providerToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartBody,
      },
    )

    if (!driveRes.ok) {
      const errText = await driveRes.text()
      console.error(`[${requestId}] ❌ Drive API failed: ${driveRes.status} ${errText.slice(0, 300)}`)
      return NextResponse.json(
        {
          error: 'Failed to save to Google Drive',
          details: `${driveRes.status}: ${errText.slice(0, 200)}`,
          hint: driveRes.status === 401 ? 'Your Google token may have expired. Sign out and sign in again.' : undefined,
        },
        { status: driveRes.status },
      )
    }

    const driveData = await driveRes.json() as { id: string; webViewLink: string }
    console.log(`[${requestId}] ✅ Saved to Drive in ${Date.now() - t0}ms: ${driveData.webViewLink}`)

    // Save Drive link back to the document
    await supabase
      .from('documents')
      .update({
        data: {
          ...data,
          _driveResearchLink: driveData.webViewLink,
          _driveResearchFileId: driveData.id,
          _driveResearchSavedAt: new Date().toISOString(),
        },
      })
      .eq('id', documentId)

    console.log(`[${requestId}] ═══════════════════════════════════════`)

    return NextResponse.json({
      success: true,
      fileId: driveData.id,
      webViewLink: driveData.webViewLink,
      fileName,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[${requestId}] ❌ FAILED:`, msg)
    return NextResponse.json(
      { error: 'Save to Drive failed', details: msg },
      { status: 500 },
    )
  }
}
