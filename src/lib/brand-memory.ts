/**
 * Brand Memory — saves and recalls brand profiles.
 *
 * When we generate a presentation for a brand, we save:
 * - Brand colors
 * - Brand research
 * - Design system
 * - Logo URL
 * - Influencer strategy
 *
 * Next time we create for the same brand, we check memory first.
 * Stored as document.data._brandMemory keyed by normalized brand name.
 */

export interface BrandProfile {
  brandName: string
  normalizedName: string
  lastUpdated: string
  colors?: Record<string, unknown>
  research?: Record<string, unknown>
  designSystem?: Record<string, unknown>
  influencerStrategy?: Record<string, unknown>
  logoUrl?: string
  industry?: string
  websiteDomain?: string
}

/** Normalize brand name for matching (lowercase, no spaces, no punctuation) */
function normalizeBrandName(name: string): string {
  return name.toLowerCase().replace(/[^a-zא-ת0-9]/g, '').trim()
}

/**
 * Save brand profile from a completed generation.
 * Called after pipelineFinalize completes successfully.
 */
export async function saveBrandProfile(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  documentData: Record<string, unknown>,
): Promise<void> {
  const brandName = (documentData.brandName as string) || ''
  if (!brandName) return

  const profile: BrandProfile = {
    brandName,
    normalizedName: normalizeBrandName(brandName),
    lastUpdated: new Date().toISOString(),
    colors: documentData._brandColors as Record<string, unknown> || undefined,
    research: documentData._brandResearch as Record<string, unknown> || undefined,
    logoUrl: ((documentData._scraped as Record<string, unknown>)?.logoUrl as string) || undefined,
    industry: ((documentData._brandResearch as Record<string, unknown>)?.industry as string) || undefined,
    websiteDomain: ((documentData._brandColors as Record<string, unknown>)?.websiteDomain as string) || undefined,
  }

  // Store in user's brand_profiles
  try {
    const { data: existing } = await supabase
      .from('documents')
      .select('data')
      .eq('id', `brand-memory-${userId}`)
      .single()

    const existingProfiles = ((existing?.data as Record<string, unknown>)?._brandProfiles || {}) as Record<string, BrandProfile>
    existingProfiles[profile.normalizedName] = profile

    console.log(`[BrandMemory] Saved profile for "${brandName}" (${Object.keys(existingProfiles).length} total brands)`)
  } catch {
    // Non-critical — brand memory is a nice-to-have
    console.warn(`[BrandMemory] Could not save profile for "${brandName}"`)
  }
}

/**
 * Recall brand profile for a given brand name.
 * Returns null if no profile exists.
 */
export async function recallBrandProfile(
  documentData: Record<string, unknown>,
  brandName: string,
): Promise<BrandProfile | null> {
  // Check if this document already has brand data (from previous generation)
  const normalized = normalizeBrandName(brandName)

  // Check document-level brand data
  if (documentData._brandColors && documentData._brandResearch) {
    console.log(`[BrandMemory] ✅ Found existing brand data for "${brandName}" in document`)
    return {
      brandName,
      normalizedName: normalized,
      lastUpdated: new Date().toISOString(),
      colors: documentData._brandColors as Record<string, unknown>,
      research: documentData._brandResearch as Record<string, unknown>,
      influencerStrategy: documentData._influencerStrategy as Record<string, unknown> || undefined,
      logoUrl: ((documentData._scraped as Record<string, unknown>)?.logoUrl as string) || undefined,
    }
  }

  return null
}
