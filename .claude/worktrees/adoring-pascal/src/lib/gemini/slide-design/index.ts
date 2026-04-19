/**
 * Slide Design modules — barrel export.
 * Internal modules for the Slide Designer pipeline.
 */

// Types
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
  PipelineFoundation,
  BatchResult,
  InfluencerResearchData,
  PremiumProposalData,
} from './types'

// Color utilities
export {
  hexToRgb,
  relativeLuminance,
  hexToLuminance,
  contrastRatio,
  adjustLightness,
  validateAndFixColors,
} from './color-utils'

// Spatial utilities
export {
  boxesOverlap,
  isImageElement,
  computeOccupiedArea,
  computeBalanceScore,
  findBestImagePlacement,
} from './spatial-utils'

// Schemas
export {
  DESIGN_SYSTEM_SCHEMA,
  SLIDE_BATCH_SCHEMA,
} from './schemas'

// Config loaders
export {
  getDesignSystemModels,
  getBatchModels,
  getSystemInstruction,
  getDesignPrinciples,
  getElementFormat,
  getTechnicalRules,
  getFinalInstruction,
  getImageRoleHints,
  getLayoutArchetypes,
  getPacingMap,
  getDepthLayers,
  getThinkingLevel,
  getBatchThinkingLevel,
  getMaxOutputTokens,
  getTemperature,
  getBatchSize,
} from './config-loaders'

// Validation
export {
  validateSlide,
  autoFixSlide,
  checkVisualConsistency,
} from './validation'

// Fallbacks
export {
  buildFallbackDesignSystem,
  buildSimpleFallbackSlide,
  buildFallbackSlide,
  createFallbackSlide,
} from './fallbacks'

// Slide content builder
export {
  cleanContent,
  chunkByMax,
  formatNum,
  buildSlideBatches,
} from './slide-content-builder'

// Logo injection
export {
  injectLeadersLogo,
  injectClientLogo,
} from './logo-injection'
