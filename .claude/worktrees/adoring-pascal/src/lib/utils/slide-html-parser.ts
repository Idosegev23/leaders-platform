/**
 * DOMParser-based utility to extract editable content from HTML slides
 * and apply edits back. Runs client-side only.
 */

export interface SlideEditableField {
  id: string          // Unique path like "h1-0", "p-2", "img-1"
  type: 'text' | 'image'
  tag: string         // Original HTML tag
  currentValue: string
  label: string       // Hebrew label for the field
}

// Tags to skip entirely
const SKIP_SELECTORS = ['style', 'script', 'meta', 'link', '.brand-watermark', '.logo-footer img', '.watermark']

// Auto-label mapping
function autoLabel(tag: string, className: string, index: number): string {
  const lower = tag.toLowerCase()
  if (lower === 'h1') return 'כותרת ראשית'
  if (lower === 'h2') return 'כותרת משנית'
  if (lower === 'h3') return 'כותרת משנה'
  if (className.includes('metric-value') || className.includes('stat-number') || className.includes('number')) return `ערך מספרי ${index + 1}`
  if (className.includes('metric-label') || className.includes('stat-label')) return `תווית מדד ${index + 1}`
  if (lower === 'li') return `פריט רשימה ${index + 1}`
  if (lower === 'img') return `תמונה ${index + 1}`
  if (lower === 'p') return `פסקה ${index + 1}`
  if (lower === 'span') return `טקסט ${index + 1}`
  if (lower === 'div') return `בלוק טקסט ${index + 1}`
  return `${lower} ${index + 1}`
}

function shouldSkip(el: Element): boolean {
  for (const sel of SKIP_SELECTORS) {
    if (el.matches?.(sel)) return true
    if (el.closest?.(sel)) return true
  }
  return false
}

function isTextElement(el: Element): boolean {
  const tag = el.tagName.toLowerCase()
  if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li'].includes(tag)) return true
  // div/span with direct text content (not just child elements)
  if (['div', 'span'].includes(tag)) {
    const directText = Array.from(el.childNodes)
      .filter(n => n.nodeType === Node.TEXT_NODE)
      .map(n => n.textContent?.trim() || '')
      .join('')
    return directText.length > 2
  }
  return false
}

export function extractEditableFields(html: string): SlideEditableField[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const body = doc.body
  if (!body) return []

  const fields: SlideEditableField[] = []
  const counters: Record<string, number> = {}

  // Walk for text elements
  const textEls = body.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, div, span')
  const visited = new Set<Element>()

  textEls.forEach(el => {
    if (shouldSkip(el)) return
    if (visited.has(el)) return

    // Skip elements whose parent is already included (avoid duplicates)
    let parentCaptured = false
    let parent = el.parentElement
    while (parent && parent !== body) {
      if (visited.has(parent)) { parentCaptured = true; break }
      parent = parent.parentElement
    }
    if (parentCaptured) return

    if (!isTextElement(el)) return

    const text = el.textContent?.trim() || ''
    if (text.length < 2) return

    const tag = el.tagName.toLowerCase()
    const count = counters[tag] || 0
    counters[tag] = count + 1
    const id = `${tag}-${count}`

    // Mark this element with a data attribute for later retrieval
    el.setAttribute('data-edit-id', id)

    visited.add(el)
    fields.push({
      id,
      type: 'text',
      tag,
      currentValue: text,
      label: autoLabel(tag, el.className || '', count),
    })
  })

  // Walk for images
  const images = body.querySelectorAll('img')
  let imgCount = 0
  images.forEach(img => {
    if (shouldSkip(img)) return
    const src = img.getAttribute('src') || ''
    if (!src || src.startsWith('data:image/svg')) return // skip SVG icons

    const id = `img-${imgCount}`
    img.setAttribute('data-edit-id', id)
    fields.push({
      id,
      type: 'image',
      tag: 'img',
      currentValue: src,
      label: autoLabel('img', img.className || '', imgCount),
    })
    imgCount++
  })

  return fields
}

export function applyEdits(html: string, edits: Record<string, string>): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const body = doc.body
  if (!body) return html

  // First, run extraction to tag elements with data-edit-id
  const textEls = body.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, div, span')
  const visited = new Set<Element>()
  const counters: Record<string, number> = {}

  textEls.forEach(el => {
    if (shouldSkip(el)) return
    if (visited.has(el)) return

    let parentCaptured = false
    let parent = el.parentElement
    while (parent && parent !== body) {
      if (visited.has(parent)) { parentCaptured = true; break }
      parent = parent.parentElement
    }
    if (parentCaptured) return
    if (!isTextElement(el)) return

    const text = el.textContent?.trim() || ''
    if (text.length < 2) return

    const tag = el.tagName.toLowerCase()
    const count = counters[tag] || 0
    counters[tag] = count + 1
    el.setAttribute('data-edit-id', `${tag}-${count}`)
    visited.add(el)
  })

  const images = body.querySelectorAll('img')
  let imgCount = 0
  images.forEach(img => {
    if (shouldSkip(img)) return
    const src = img.getAttribute('src') || ''
    if (!src || src.startsWith('data:image/svg')) return
    img.setAttribute('data-edit-id', `img-${imgCount}`)
    imgCount++
  })

  // Apply edits
  for (const [editId, newValue] of Object.entries(edits)) {
    const el = body.querySelector(`[data-edit-id="${editId}"]`)
    if (!el) continue

    if (editId.startsWith('img-')) {
      el.setAttribute('src', newValue)
    } else {
      el.textContent = newValue
    }
  }

  // Clean up data-edit-id attributes
  body.querySelectorAll('[data-edit-id]').forEach(el => {
    el.removeAttribute('data-edit-id')
  })

  // Serialize back to full HTML
  const serializer = new XMLSerializer()
  const headContent = doc.head ? serializer.serializeToString(doc.head) : ''
  const bodyContent = serializer.serializeToString(body)

  // Reconstruct full HTML document
  return `<!DOCTYPE html><html>${headContent}${bodyContent}</html>`
}
