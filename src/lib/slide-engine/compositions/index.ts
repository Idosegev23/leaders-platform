/**
 * Composition Registry — maps CompositionType → layout function
 */

import type { CompositionType, CompositionFn } from '../types'
import { heroCenterLayout } from './hero-center'
import { heroLeftLayout, heroRightLayout } from './hero-left'
import { splitScreenLayout } from './split-screen'
import { bentoGridLayout } from './bento-grid'
import { dataArtLayout } from './data-art'
import { editorialLayout } from './editorial'
import { cardsFloatLayout } from './cards-float'
import { fullBleedLayout } from './full-bleed'
import { timelineFlowLayout } from './timeline-flow'

export const COMPOSITIONS: Record<CompositionType, CompositionFn> = {
  'hero-center': heroCenterLayout,
  'hero-left': heroLeftLayout,
  'hero-right': heroRightLayout,
  'split-screen': splitScreenLayout,
  'bento-grid': bentoGridLayout,
  'data-art': dataArtLayout,
  'editorial': editorialLayout,
  'cards-float': cardsFloatLayout,
  'full-bleed': fullBleedLayout,
  'timeline-flow': timelineFlowLayout,
}

/** Get composition function — falls back to hero-center */
export function getComposition(type: CompositionType): CompositionFn {
  return COMPOSITIONS[type] || heroCenterLayout
}
