/**
 * Version History — tracks presentation versions.
 *
 * Each time a presentation is generated or significantly edited,
 * a snapshot is saved. Users can view and rollback to previous versions.
 *
 * Stored in document.data._versions: VersionEntry[]
 * Max 5 versions to keep document size manageable.
 */

export interface VersionEntry {
  id: string
  createdAt: string
  trigger: 'generation' | 'regenerate-slide' | 'manual-edit' | 'template-change'
  slideCount: number
  qualityScore?: number
  pipeline?: string
  /** For HTML-native: store slide count only (HTML too big for version array) */
  isHtmlNative: boolean
  /** For AST: store the full presentation (compact) */
  presentationSnapshot?: unknown
  /** Summary for display */
  summary: string
}

const MAX_VERSIONS = 5

/**
 * Add a version entry to the document's version history.
 * Keeps only the last MAX_VERSIONS entries.
 */
export function addVersion(
  existingVersions: VersionEntry[] | undefined,
  newVersion: Omit<VersionEntry, 'id' | 'createdAt'>,
): VersionEntry[] {
  const versions = [...(existingVersions || [])]
  const entry: VersionEntry = {
    ...newVersion,
    id: `v-${Date.now()}`,
    createdAt: new Date().toISOString(),
  }
  versions.push(entry)

  // Keep only last MAX_VERSIONS
  if (versions.length > MAX_VERSIONS) {
    versions.splice(0, versions.length - MAX_VERSIONS)
  }

  return versions
}

/**
 * Create a version entry from an HTML-native presentation.
 */
export function createHtmlVersion(
  slideCount: number,
  qualityScore: number,
  trigger: VersionEntry['trigger'] = 'generation',
): Omit<VersionEntry, 'id' | 'createdAt'> {
  return {
    trigger,
    slideCount,
    qualityScore,
    pipeline: 'html-native-v6',
    isHtmlNative: true,
    summary: `${slideCount} שקפים (HTML-Native) — quality: ${qualityScore}/100`,
  }
}

/**
 * Create a version entry from an AST presentation.
 */
export function createAstVersion(
  slideCount: number,
  qualityScore: number,
  trigger: VersionEntry['trigger'] = 'generation',
): Omit<VersionEntry, 'id' | 'createdAt'> {
  return {
    trigger,
    slideCount,
    qualityScore,
    pipeline: 'intent-engine-v5',
    isHtmlNative: false,
    summary: `${slideCount} שקפים (AST) — quality: ${qualityScore}/100`,
  }
}
