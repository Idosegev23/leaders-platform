/**
 * Slide Design modules — barrel export.
 * Internal modules for the Slide Designer pipeline.
 */

// Types + Schemas
export type {
  BrandDesignInput,
  SlideContentInput,
  PremiumDesignSystem,
  BatchContext,
  SingleSlideContext,
  PacingDirective,
  ValidationResult,
  ValidationIssue,
  BoundingBox,
  SlidePlan,
  PipelineFoundation,
  BatchResult,
  HtmlBatchResult,
  HtmlPresentation,
  InfluencerResearchData,
  PremiumProposalData,
} from './types'

export {
  DESIGN_SYSTEM_SCHEMA,
  SLIDE_PLAN_SCHEMA,
  SLIDE_BATCH_SCHEMA,
} from './types'

// Utilities (color + spatial + validation)
export {
  hexToRgb,
  relativeLuminance,
  hexToLuminance,
  contrastRatio,
  adjustLightness,
  validateAndFixColors,
  boxesOverlap,
  isImageElement,
  computeOccupiedArea,
  computeBalanceScore,
  findBestImagePlacement,
  validateSlide,
  autoFixSlide,
  checkVisualConsistency,
} from './utils'

// Config loaders
export {
  getDesignSystemModels,
  getBatchModels,
  getSystemInstruction,
  getImageRoleHints,
  getLayoutArchetypes,
  getPacingMap,
  getThinkingLevel,
  getBatchThinkingLevel,
  getMaxOutputTokens,
  getTemperature,
  getBatchSize,
} from './config-loaders'

// Fallbacks
export {
  buildFallbackDesignSystem,
  buildSimpleFallbackSlide,
  buildFallbackSlide,
  createFallbackSlide,
} from './fallbacks'

// Logo injection
export {
  injectLeadersLogo,
  injectClientLogo,
} from './logo-injection'
