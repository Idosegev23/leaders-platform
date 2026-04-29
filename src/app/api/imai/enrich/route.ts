import { NextResponse } from 'next/server'
import { getAudienceReport, getInstagramUserInfo } from '@/lib/imai/client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * POST /api/imai/enrich
 * Body: { username: string, platform?: 'instagram'|'tiktok'|'youtube' }
 *
 * Pulls a full IMAI audience report for an existing influencer and
 * normalizes it into the wizard's InfluencerProfile shape so the UI
 * can merge it into a row in one click.
 */
export async function POST(request: Request) {
  const requestId = `imai-enrich-${Date.now()}`

  let body: { username?: string; platform?: 'instagram' | 'tiktok' | 'youtube' } | null = null
  try { body = await request.json() } catch {}

  const rawUsername = (body?.username ?? '').trim()
  if (!rawUsername) {
    return NextResponse.json({ error: 'username is required' }, { status: 400 })
  }

  const platform = body?.platform ?? 'instagram'
  const username = normalizeHandle(rawUsername)
  if (!username) {
    return NextResponse.json({ error: 'Invalid username' }, { status: 400 })
  }

  console.log(`[${requestId}] Enriching @${username} on ${platform}`)

  try {
    // 1. Audience report — main data source (followers, ER, demographics, picture).
    const report = await getAudienceReport(username, platform, false)
    if (!report?.user_profile) {
      return NextResponse.json({ error: 'IMAI returned no profile' }, { status: 502 })
    }

    // 2. Optional: raw user-info call for is_verified (Instagram only).
    let isVerified: boolean | undefined
    if (platform === 'instagram') {
      try {
        const info = await getInstagramUserInfo(username)
        const v = (info as Record<string, unknown>).is_verified
                ?? (info as Record<string, unknown>).verified
        isVerified = typeof v === 'boolean' ? v : undefined
      } catch {
        // Not fatal — verified flag is nice-to-have.
      }
    }

    const profile = report.user_profile
    const audience = report.audience_followers?.data

    const israeliAudiencePercent = pickIsraeliPercent(audience?.audience_geo?.countries)

    const enriched = {
      name: profile.fullname || username,
      username,
      profileUrl: profileUrlFor(platform, username),
      profilePicUrl: profile.picture || '',
      followers: profile.followers ?? 0,
      engagementRate: roundTo(profile.engagement_rate ?? 0, 2),
      avgStoryViews: undefined as number | undefined,
      avgReelViews: profile.avg_views ?? undefined,
      israeliAudiencePercent,
      genderSplit: pickGenderSplit(audience?.audience_genders),
      ageSplit: pickAgeSplit(audience?.audience_ages),
      bio: profile.description || '',
      isVerified,
      _audienceCredibility: audience?.audience_credibility,
      _platform: platform,
    }

    console.log(`[${requestId}] ✅ Enriched @${username}: ${enriched.followers.toLocaleString()} followers, ER ${enriched.engagementRate}%, IL ${israeliAudiencePercent ?? '?'}%`)

    return NextResponse.json({ ok: true, profile: enriched })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[${requestId}] ❌ ${msg}`)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}

/* ---- helpers ---- */

function normalizeHandle(input: string): string | null {
  let s = input.trim()
  // Strip URL prefixes for IG / TikTok / YouTube
  s = s.replace(/^https?:\/\/(www\.)?(instagram|tiktok|youtube)\.com\/(@)?/i, '')
  s = s.replace(/^@/, '').replace(/\/.*$/, '')
  s = s.replace(/[^a-zA-Z0-9._-]/g, '')
  return s.length >= 2 ? s : null
}

function profileUrlFor(platform: string, username: string): string {
  if (platform === 'tiktok') return `https://www.tiktok.com/@${username}`
  if (platform === 'youtube') return `https://www.youtube.com/@${username}`
  return `https://instagram.com/${username}`
}

function roundTo(n: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(n * factor) / factor
}

function pickIsraeliPercent(countries: { name?: string; weight?: number }[] | undefined): number | undefined {
  if (!Array.isArray(countries)) return undefined
  const il = countries.find((c) => /israel|ישראל/i.test(c?.name ?? ''))
  if (!il || typeof il.weight !== 'number') return undefined
  return Math.round(il.weight * 1000) / 10
}

function pickGenderSplit(rows: { code?: string; weight?: number }[] | undefined): { male: number; female: number } | undefined {
  if (!Array.isArray(rows)) return undefined
  const male = rows.find((r) => r?.code?.toUpperCase() === 'MALE')?.weight
  const female = rows.find((r) => r?.code?.toUpperCase() === 'FEMALE')?.weight
  if (typeof male !== 'number' || typeof female !== 'number') return undefined
  return {
    male: Math.round(male * 1000) / 10,
    female: Math.round(female * 1000) / 10,
  }
}

function pickAgeSplit(rows: { code?: string; weight?: number }[] | undefined): { range: string; percent: number }[] | undefined {
  if (!Array.isArray(rows) || rows.length === 0) return undefined
  return rows
    .filter((r) => typeof r.weight === 'number' && r.weight > 0)
    .map((r) => ({
      range: r.code ?? '?',
      percent: Math.round((r.weight ?? 0) * 1000) / 10,
    }))
    .sort((a, b) => b.percent - a.percent)
    .slice(0, 6)
}
