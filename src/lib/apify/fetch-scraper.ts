/**
 * Lightweight Fetch-based Scraper
 * Fallback when Apify quota is exceeded.
 * Uses plain fetch + regex HTML parsing — no external dependencies.
 */

import { validateExternalUrl } from '@/lib/utils/url-validator'

export interface EnhancedScrapeResult {
  url: string
  title: string
  description: string
  screenshot: string | null
  logoUrl: string | null
  logoAlternatives: string[]
  favicon: string | null
  ogImage: string | null
  heroImages: string[]
  productImages: string[]
  lifestyleImages: string[]
  allImages: string[]
  primaryColor: string | null
  secondaryColor: string | null
  accentColor: string | null
  colorPalette: string[]
  headings: { h1: string[]; h2: string[]; h3: string[] }
  paragraphs: string[]
  tagline: string | null
  aboutText: string | null
  socialLinks: Record<string, string>
  emails: string[]
  phones: string[]
  address: string | null
  metaKeywords: string[]
  metaDescription: string
  dominantColors?: string[]
  cssColors?: string[]
}

/**
 * Scrape a website using plain fetch (no Apify).
 * Returns the same shape as enhancedScrape for drop-in compatibility.
 */
export async function fetchScrape(url: string): Promise<EnhancedScrapeResult> {
  // SSRF protection — validate before fetching
  url = validateExternalUrl(url)
  console.log(`[Fetch Scraper] Scraping ${url}`)

  let html = ''
  let finalUrl = url

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000) // 15s timeout

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
      },
    })

    clearTimeout(timeout)
    finalUrl = res.url || url
    html = await res.text()
    console.log(`[Fetch Scraper] Got ${html.length} chars of HTML`)
  } catch (err) {
    console.error('[Fetch Scraper] Fetch failed:', err)
    return emptyResult(url)
  }

  if (!html || html.length < 100) {
    console.log('[Fetch Scraper] HTML too short, returning empty')
    return emptyResult(url)
  }

  // ─── Parse HTML ───
  const title = extractMeta(html, 'title') || extractTag(html, 'title') || ''
  const description = extractMeta(html, 'description') || ''
  const ogImage = extractMetaProperty(html, 'og:image', url)
  const favicon = extractFavicon(html, url)

  // Logo
  const logoUrl = extractLogo(html, url)

  // Images
  const images = extractImages(html, url)
  const categorized = categorizeImages(images, html)

  // Colors from CSS
  const colors = extractColorsFromHTML(html)

  // Headings
  const headings = extractHeadings(html)

  // Paragraphs
  const paragraphs = extractParagraphs(html)

  // Social links
  const socialLinks = extractSocialLinks(html)

  // Contact
  const { emails, phones, address } = extractContactInfo(html)

  // Tagline
  const tagline = extractTagline(html)

  // About text
  const aboutText = extractAboutText(html, paragraphs)

  // Keywords
  const metaKeywords = (extractMeta(html, 'keywords') || '')
    .split(',')
    .map(k => k.trim())
    .filter(Boolean)

  console.log(`[Fetch Scraper] Extracted: logo=${!!logoUrl}, images=${images.length}, colors=${colors.palette.length}`)

  return {
    url: finalUrl,
    title,
    description,
    screenshot: null,
    logoUrl,
    logoAlternatives: [],
    favicon,
    ogImage,
    heroImages: categorized.hero,
    productImages: categorized.product,
    lifestyleImages: categorized.lifestyle,
    allImages: images,
    primaryColor: colors.primary,
    secondaryColor: colors.secondary,
    accentColor: colors.accent,
    colorPalette: colors.palette,
    headings,
    paragraphs,
    tagline,
    aboutText,
    socialLinks,
    emails,
    phones,
    address,
    metaKeywords,
    metaDescription: description,
  }
}

// ─── HTML Extraction Helpers ─────────────────────────────────

function emptyResult(url: string): EnhancedScrapeResult {
  return {
    url,
    title: '',
    description: '',
    screenshot: null,
    logoUrl: null,
    logoAlternatives: [],
    favicon: null,
    ogImage: null,
    heroImages: [],
    productImages: [],
    lifestyleImages: [],
    allImages: [],
    primaryColor: null,
    secondaryColor: null,
    accentColor: null,
    colorPalette: [],
    headings: { h1: [], h2: [], h3: [] },
    paragraphs: [],
    tagline: null,
    aboutText: null,
    socialLinks: {},
    emails: [],
    phones: [],
    address: null,
    metaKeywords: [],
    metaDescription: '',
  }
}

function extractTag(html: string, tag: string): string | null {
  const m = html.match(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, 'i'))
  return m?.[1]?.trim() || null
}

function extractMeta(html: string, name: string): string | null {
  const m = html.match(new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'))
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, 'i'))
  return m?.[1]?.trim() || null
}

function extractMetaProperty(html: string, property: string, baseUrl: string): string | null {
  const m = html.match(new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'))
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, 'i'))
  if (!m?.[1]) return null
  try { return new URL(m[1], baseUrl).href } catch { return m[1] }
}

function extractFavicon(html: string, baseUrl: string): string | null {
  const m = html.match(/<link[^>]+rel=["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]+href=["']([^"']+)["']/i)
    || html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:icon|shortcut icon)["']/i)
  if (!m?.[1]) return null
  try { return new URL(m[1], baseUrl).href } catch { return null }
}

function extractLogo(html: string, baseUrl: string): string | null {
  // Priority-ordered selectors - comprehensive patterns
  const patterns = [
    // img with logo in class/id (handle both src before and after class)
    /<img[^>]+(?:class|id)=["'][^"']*logo[^"']*["'][^>]+(?:src|data-src|data-lazy-src)=["']([^"']+)["']/i,
    /<img[^>]+(?:src|data-src)=["']([^"']+)["'][^>]+(?:class|id)=["'][^"']*logo[^"']*["']/i,
    // img inside element with logo class (nested)
    /<(?:a|div|span|header|li)[^>]+(?:class|id)=["'][^"']*logo[^"']*["'][^>]*>[\s\S]*?<img[^>]+(?:src|data-src)=["']([^"']+)["']/i,
    // img with src/filename containing "logo"
    /<img[^>]+(?:src|data-src)=["']([^"']*logo[^"']+)["']/i,
    // img with alt containing "logo" or brand name
    /<img[^>]+alt=["'][^"']*logo[^"']*["'][^>]+(?:src|data-src)=["']([^"']+)["']/i,
    /<img[^>]+(?:src|data-src)=["']([^"']+)["'][^>]+alt=["'][^"']*logo[^"']*["']/i,
    // img inside navbar/header
    /<(?:header|nav)[^>]*>[\s\S]*?<img[^>]+(?:src|data-src)=["']([^"']+)["']/i,
    // img with brand/site-logo class
    /<img[^>]+(?:class|id)=["'][^"']*(?:brand|site-logo|navbar-brand|company)[^"']*["'][^>]+(?:src|data-src)=["']([^"']+)["']/i,
    // Link tag with rel=icon (favicon as last resort for logo)
    /<link[^>]+rel=["'](?:icon|apple-touch-icon)["'][^>]+href=["']([^"']+)["']/i,
  ]

  for (const pattern of patterns) {
    const m = pattern.exec(html)
    if (m?.[1]) {
      const src = m[1]
      if (src.startsWith('data:') || src.includes('placeholder') || src.includes('pixel')) continue
      try { return new URL(src, baseUrl).href } catch { continue }
    }
  }

  // Fallback: og:image (many brand sites use their logo/product as og:image)
  const ogImage = extractMetaProperty(html, 'og:image', baseUrl)
  if (ogImage) return ogImage

  return null
}

function extractImages(html: string, baseUrl: string): string[] {
  const images = new Set<string>()
  const skipWords = ['placeholder', 'pixel', 'spacer', 'blank', 'transparent', 'tracking', '.gif']

  function addImage(src: string) {
    if (!src || src.startsWith('data:')) return
    if (skipWords.some(w => src.toLowerCase().includes(w))) return
    try { images.add(new URL(src, baseUrl).href) } catch { /* skip */ }
  }

  // Standard img tags - src and data-src variants
  const imgPatterns = [
    /<img[^>]+src=["']([^"']+)["']/gi,
    /<img[^>]+data-src=["']([^"']+)["']/gi,
    /<img[^>]+data-lazy-src=["']([^"']+)["']/gi,
    /<img[^>]+data-original=["']([^"']+)["']/gi,
  ]

  for (const pattern of imgPatterns) {
    let m
    while ((m = pattern.exec(html)) !== null) {
      // Skip tiny tracking pixels
      const context = html.slice(Math.max(0, m.index - 200), m.index + m[0].length + 100)
      const widthMatch = context.match(/width=["']?(\d+)/)
      if (widthMatch && parseInt(widthMatch[1]) < 10) continue
      addImage(m[1])
    }
  }

  // srcset images - pick the largest
  const srcsetPattern = /srcset=["']([^"']+)["']/gi
  let m
  while ((m = srcsetPattern.exec(html)) !== null) {
    const sources = m[1].split(',')
    for (const s of sources) {
      const src = s.trim().split(/\s+/)[0]
      addImage(src)
    }
  }

  // CSS background-image
  const bgPattern = /background(?:-image)?\s*:\s*url\(["']?([^"')]+)["']?\)/gi
  while ((m = bgPattern.exec(html)) !== null) {
    addImage(m[1])
  }

  // picture/source elements
  const sourcePattern = /<source[^>]+srcset=["']([^"'\s]+)/gi
  while ((m = sourcePattern.exec(html)) !== null) {
    addImage(m[1])
  }

  // og:image and twitter:image meta tags
  const ogImagePattern = /<meta[^>]+(?:property=["']og:image["']|name=["']twitter:image["'])[^>]+content=["']([^"']+)["']/gi
  while ((m = ogImagePattern.exec(html)) !== null) {
    addImage(m[1])
  }

  return Array.from(images).slice(0, 50)
}

function categorizeImages(images: string[], html: string): {
  hero: string[]
  product: string[]
  lifestyle: string[]
} {
  const hero: string[] = []
  const product: string[] = []
  const lifestyle: string[] = []

  for (const img of images) {
    const lower = img.toLowerCase()
    if (lower.includes('hero') || lower.includes('banner') || lower.includes('slider') || lower.includes('cover')) {
      hero.push(img)
    } else if (lower.includes('product') || lower.includes('item') || lower.includes('shop') || lower.includes('catalog')) {
      product.push(img)
    } else if (lower.includes('lifestyle') || lower.includes('about') || lower.includes('team') || lower.includes('brand')) {
      lifestyle.push(img)
    } else {
      lifestyle.push(img)
    }
  }

  return {
    hero: hero.slice(0, 10),
    product: product.slice(0, 20),
    lifestyle: lifestyle.slice(0, 15),
  }
}

function extractColorsFromHTML(html: string): {
  primary: string | null
  secondary: string | null
  accent: string | null
  palette: string[]
} {
  const colorCounts = new Map<string, number>()

  function addColor(hex: string, boost: number = 1) {
    hex = hex.toLowerCase()
    if (hex.length === 4) {
      hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    }
    if (hex.length === 7 && !isBoringColor(hex)) {
      colorCounts.set(hex, (colorCounts.get(hex) || 0) + boost)
    }
  }

  // Hex colors
  const hexPattern = /#([0-9A-Fa-f]{3,6})\b/g
  let m
  while ((m = hexPattern.exec(html)) !== null) {
    addColor(m[0])
  }

  // RGB colors
  const rgbPattern = /rgba?\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/g
  while ((m = rgbPattern.exec(html)) !== null) {
    const r = parseInt(m[1]), g = parseInt(m[2]), b = parseInt(m[3])
    if (r <= 255 && g <= 255 && b <= 255) {
      addColor(`#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`)
    }
  }

  // HSL colors → convert to hex
  const hslPattern = /hsla?\s*\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%/g
  while ((m = hslPattern.exec(html)) !== null) {
    const hex = hslToHex(parseInt(m[1]), parseInt(m[2]), parseInt(m[3]))
    if (hex) addColor(hex)
  }

  // CSS custom properties (high priority - brand colors)
  const varPattern = /--(?:primary|brand|main|accent|theme|color)[^:]*:\s*(#[0-9A-Fa-f]{3,6})\b/g
  while ((m = varPattern.exec(html)) !== null) {
    addColor(m[1], 10) // Strong boost for named brand vars
  }

  // All CSS vars with colors
  const allVarPattern = /--[^:]+:\s*(#[0-9A-Fa-f]{3,6})\b/g
  while ((m = allVarPattern.exec(html)) !== null) {
    addColor(m[1], 3)
  }

  // Inline style colors (elements with brand styling)
  const inlinePattern = /style=["'][^"']*(?:background(?:-color)?|color|border-color)\s*:\s*(#[0-9A-Fa-f]{3,6})/gi
  while ((m = inlinePattern.exec(html)) !== null) {
    addColor(m[1], 2)
  }

  // data-color attributes
  const dataColorPattern = /data-(?:color|bg|theme)=["'](#[0-9A-Fa-f]{3,6})["']/gi
  while ((m = dataColorPattern.exec(html)) !== null) {
    addColor(m[1], 5)
  }

  // theme-color meta tag (mobile brand color)
  const themeColorPattern = /<meta[^>]+name=["']theme-color["'][^>]+content=["'](#[0-9A-Fa-f]{3,6})["']/i
  const themeMatch = themeColorPattern.exec(html)
  if (themeMatch) {
    addColor(themeMatch[1], 15) // Highest priority - explicit brand color
  }

  // msapplication-TileColor meta tag
  const tilePattern = /<meta[^>]+name=["']msapplication-TileColor["'][^>]+content=["'](#[0-9A-Fa-f]{3,6})["']/i
  const tileMatch = tilePattern.exec(html)
  if (tileMatch) {
    addColor(tileMatch[1], 12)
  }

  const sorted = Array.from(colorCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([color]) => color)

  return {
    primary: sorted[0] || null,
    secondary: sorted[1] || null,
    accent: sorted[2] || null,
    palette: sorted.slice(0, 10),
  }
}

function hslToHex(h: number, s: number, l: number): string | null {
  try {
    s /= 100; l /= 100
    const a = s * Math.min(l, 1 - l)
    const f = (n: number) => {
      const k = (n + h / 30) % 12
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
      return Math.round(255 * color).toString(16).padStart(2, '0')
    }
    return `#${f(0)}${f(8)}${f(4)}`
  } catch { return null }
}

function isBoringColor(hex: string): boolean {
  if (hex.length !== 7) return true
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  if (isNaN(r) || isNaN(g) || isNaN(b)) return true
  // Pure white/black
  if ((r === 255 && g === 255 && b === 255) || (r === 0 && g === 0 && b === 0)) return true
  // Very light or very dark grays
  const isGray = Math.abs(r - g) < 20 && Math.abs(g - b) < 20
  if (isGray && (r > 235 || r < 25)) return true
  return false
}

function extractHeadings(html: string): { h1: string[]; h2: string[]; h3: string[] } {
  const headings: { h1: string[]; h2: string[]; h3: string[] } = { h1: [], h2: [], h3: [] }
  for (const level of ['h1', 'h2', 'h3'] as const) {
    const pattern = new RegExp(`<${level}[^>]*>\\s*([^<]+?)\\s*</${level}>`, 'gi')
    let m
    while ((m = pattern.exec(html)) !== null) {
      const text = m[1].trim()
      if (text.length > 2 && text.length < 200) headings[level].push(text)
    }
  }
  return headings
}

function extractParagraphs(html: string): string[] {
  const paragraphs: string[] = []
  const pattern = /<p[^>]*>([^<]+)<\/p>/gi
  let m
  while ((m = pattern.exec(html)) !== null) {
    const text = m[1].trim()
    if (text.length > 30) paragraphs.push(text)
  }
  return paragraphs.slice(0, 30)
}

function extractSocialLinks(html: string): EnhancedScrapeResult['socialLinks'] {
  const links: EnhancedScrapeResult['socialLinks'] = {}
  const patterns: { platform: keyof EnhancedScrapeResult['socialLinks']; pattern: RegExp }[] = [
    { platform: 'instagram', pattern: /https?:\/\/(?:www\.)?instagram\.com\/([^\/\s"'<>]+)/i },
    { platform: 'facebook', pattern: /https?:\/\/(?:www\.)?facebook\.com\/([^\/\s"'<>]+)/i },
    { platform: 'twitter', pattern: /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/([^\/\s"'<>]+)/i },
    { platform: 'linkedin', pattern: /https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/([^\/\s"'<>]+)/i },
    { platform: 'youtube', pattern: /https?:\/\/(?:www\.)?youtube\.com\/([^\/\s"'<>]+)/i },
    { platform: 'tiktok', pattern: /https?:\/\/(?:www\.)?tiktok\.com\/@?([^\/\s"'<>]+)/i },
  ]
  for (const { platform, pattern } of patterns) {
    const m = pattern.exec(html)
    if (m) links[platform] = m[0]
  }
  return links
}

function extractContactInfo(html: string): { emails: string[]; phones: string[]; address: string | null } {
  const emails: string[] = []
  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
  let m
  while ((m = emailPattern.exec(html)) !== null) {
    if (!m[0].includes('example') && !m[0].includes('sentry') && !m[0].includes('webpack')) {
      emails.push(m[0])
    }
  }

  const phones: string[] = []
  const phonePattern = /(?:\+972|0)[-\s]?(?:\d[-\s]?){8,10}/g
  while ((m = phonePattern.exec(html)) !== null) {
    phones.push(m[0].trim())
  }

  let address: string | null = null
  const addressMatch = html.match(/<address[^>]*>([^<]+)<\/address>/i)
  if (addressMatch) address = addressMatch[1].trim()

  return {
    emails: Array.from(new Set(emails)).slice(0, 5),
    phones: Array.from(new Set(phones)).slice(0, 5),
    address,
  }
}

function extractTagline(html: string): string | null {
  const patterns = [
    /<(?:p|span|div)[^>]+class=["'][^"']*(?:tagline|slogan|subtitle|hero-text)[^"']*["'][^>]*>([^<]+)</gi,
    /<h2[^>]*>([^<]{10,100})<\/h2>/gi,
  ]
  for (const pattern of patterns) {
    const m = pattern.exec(html)
    if (m?.[1]) {
      const text = m[1].trim()
      if (text.length > 10 && text.length < 150) return text
    }
  }
  return null
}

function extractAboutText(html: string, paragraphs: string[]): string | null {
  const aboutPattern = /<(?:div|section)[^>]+(?:class|id)=["'][^"']*about[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|section)>/gi
  const m = aboutPattern.exec(html)
  if (m) {
    const texts: string[] = []
    const pPattern = /<p[^>]*>([^<]+)<\/p>/gi
    let pm
    while ((pm = pPattern.exec(m[1])) !== null) {
      if (pm[1].trim().length > 30) texts.push(pm[1].trim())
    }
    if (texts.length > 0) return texts.slice(0, 3).join(' ')
  }
  const sorted = paragraphs.filter(p => p.length > 100 && p.length < 1000).sort((a, b) => b.length - a.length)
  return sorted[0] || null
}
