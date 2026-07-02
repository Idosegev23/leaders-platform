/**
 * Brand assets — shared contract for the art-director engine upgrade.
 *
 * Stored on `documents.data._brandAssets`. Every asset that enters a deck
 * (logo, product photo, generated scene) carries a verification verdict from
 * the two-phase VLM check in ./vlm-verify — a failed verification never blocks
 * generation, it flags the asset for manual review in the editor.
 */

export type AssetVerificationStatus = 'verified' | 'unverified' | 'rejected'

export interface VerifiedAsset {
  url: string
  status: AssetVerificationStatus
  /** Short human-readable reasoning from the verifier (Hebrew ok). */
  reasoning?: string
  checkedAt?: string
}

export type LogoSource =
  | 'site-scrape'
  | 'brandfetch'
  | 'logodev'
  | 'og-image'
  | 'favicon'
  | 'manual'

export interface BrandLogoAsset extends VerifiedAsset {
  source: LogoSource
}

export interface SceneImageAsset extends VerifiedAsset {
  /** Which slide archetype this scene was generated for (e.g. 'hero-cover'). */
  forSlideType?: string
  /** The English generation prompt used (for regeneration/debugging). */
  prompt?: string
  /** URLs of the product reference images that seeded the generation. */
  referenceUrls?: string[]
}

export interface BrandAssets {
  logo?: BrandLogoAsset
  /** Verified real product photos (scraped/wizard-uploaded), max ~6. */
  productImages?: VerifiedAsset[]
  /** AI-generated lifestyle scenes containing the real product. */
  sceneImages?: SceneImageAsset[]
  updatedAt?: string
}
