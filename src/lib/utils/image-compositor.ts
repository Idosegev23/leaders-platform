/**
 * Image Compositor — Sharp-based logo compositing for generated images.
 * Composites a brand logo onto a generated image at a specified corner.
 * Fail-safe: returns original buffer on any error.
 */

import sharp from 'sharp'

export type LogoCorner = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'

export interface CompositeLogoOptions {
  logoBuffer: Buffer
  /** Logo width as fraction of base image width (default: 0.12 = ~230px on 1920px) */
  logoWidthRatio?: number
  /** Corner placement (default: 'bottom-right') */
  corner?: LogoCorner
  /** Padding from edge in pixels (default: 40) */
  padding?: number
  /** Logo opacity 0.0–1.0 (default: 0.82) */
  opacity?: number
}

export async function compositeLogo(
  baseBuffer: Buffer,
  options: CompositeLogoOptions,
): Promise<Buffer> {
  const {
    logoBuffer,
    logoWidthRatio = 0.12,
    corner = 'bottom-right',
    padding = 40,
    opacity = 0.82,
  } = options

  try {
    const baseMeta = await sharp(baseBuffer).metadata()
    const baseWidth = baseMeta.width || 1920
    const baseHeight = baseMeta.height || 1080

    // Resize logo to target width, preserving aspect ratio
    const targetLogoWidth = Math.round(baseWidth * logoWidthRatio)
    const resizedLogo = await sharp(logoBuffer)
      .resize(targetLogoWidth, undefined, { fit: 'inside', withoutEnlargement: false })
      .ensureAlpha()
      .png()
      .toBuffer()

    // Get resized dimensions for placement math
    const logoMeta = await sharp(resizedLogo).metadata()
    const logoWidth = logoMeta.width || targetLogoWidth
    const logoHeight = logoMeta.height || Math.round(targetLogoWidth * 0.35)

    // Apply opacity by directly modifying alpha channel in raw pixels
    const { data: rawData, info } = await sharp(resizedLogo)
      .raw()
      .toBuffer({ resolveWithObject: true })

    for (let i = 3; i < rawData.length; i += 4) {
      rawData[i] = Math.round(rawData[i] * opacity)
    }

    const logoWithOpacity = await sharp(rawData, {
      raw: { width: info.width, height: info.height, channels: 4 },
    }).png().toBuffer()

    // Compute position from corner
    let left: number
    let top: number

    switch (corner) {
      case 'top-left':
        left = padding
        top = padding
        break
      case 'top-right':
        left = baseWidth - logoWidth - padding
        top = padding
        break
      case 'bottom-left':
        left = padding
        top = baseHeight - logoHeight - padding
        break
      case 'bottom-right':
      default:
        left = baseWidth - logoWidth - padding
        top = baseHeight - logoHeight - padding
        break
    }

    return await sharp(baseBuffer)
      .composite([{
        input: logoWithOpacity,
        top: Math.max(0, top),
        left: Math.max(0, left),
        blend: 'over',
      }])
      .png()
      .toBuffer()
  } catch (err) {
    console.error('[ImageCompositor] Failed to composite logo, returning original:', err)
    return baseBuffer
  }
}
