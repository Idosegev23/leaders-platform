/**
 * Brief Excerpt Utilities
 * Extracts relevant portions of raw brief text for each wizard field.
 * Uses keyword-based paragraph matching — zero API calls.
 */

type FieldType =
  | 'background'
  | 'goals'
  | 'audience'
  | 'insight'
  | 'strategy'
  | 'creative'
  | 'deliverables'
  | 'budget'

const FIELD_KEYWORDS: Record<FieldType, string[]> = {
  background: [
    'רקע', 'אודות', 'החברה', 'המותג', 'הסיפור', 'היסטוריה',
    'פעילות', 'תחום', 'עוסק', 'מתמחה', 'מציע', 'מספק',
    'הוקמה', 'נוסדה', 'שנים', 'מוביל', 'brand',
  ],
  goals: [
    'מטרה', 'מטרות', 'יעד', 'יעדים', 'להשיג', 'לקדם', 'לחזק',
    'להגדיל', 'לבסס', 'מודעות', 'חשיפה', 'מכירות', 'המרות',
    'KPI', 'ROI', 'תוצאות', 'ביצועים', 'הצלחה',
  ],
  audience: [
    'קהל', 'יעד', 'גילאי', 'דמוגרפי', 'צרכן', 'לקוח', 'פרופיל',
    'נשים', 'גברים', 'צעיר', 'אמהות', 'הורים', 'סגנון חיים',
    'תחומי עניין', 'התנהגות', 'רכישה', 'צריכה',
  ],
  insight: [
    'תובנה', 'ממצא', 'נתון', 'מחקר', 'מגמה', 'טרנד', 'שינוי',
    'הזדמנות', 'פער', 'צורך', 'בעיה', 'אתגר', 'כאב',
  ],
  strategy: [
    'אסטרטגיה', 'גישה', 'תוכנית', 'כיוון', 'מהלך', 'שלב',
    'תהליך', 'ציר', 'עיקרון', 'מסר', 'מיצוב', 'positioning',
  ],
  creative: [
    'קריאייטיב', 'רעיון', 'קונספט', 'ויזואל', 'תוכן', 'סגנון',
    'עיצוב', 'נראות', 'שפה', 'טון', 'look', 'feel', 'mood',
  ],
  deliverables: [
    'תוצר', 'דליברבל', 'סטורי', 'רילז', 'פוסט', 'תוכן', 'כמות',
    'סרטון', 'וידאו', 'תמונה', 'קמפיין', 'פרסום',
  ],
  budget: [
    'תקציב', 'עלות', 'מחיר', 'השקעה', 'בג\'ט', 'budget',
    'שקל', 'ש"ח', '₪', 'NIS', 'כסף', 'פיננסי',
  ],
}

/**
 * Extract a relevant excerpt from raw brief text based on field type.
 * Scores each paragraph by keyword matches and returns the best ones.
 */
export function extractBriefExcerpt(
  rawBriefText: string,
  fieldType: FieldType,
  maxLength = 600,
): string | null {
  if (!rawBriefText || rawBriefText.trim().length < 20) return null

  const keywords = FIELD_KEYWORDS[fieldType]
  if (!keywords) return null

  // Split into paragraphs (double newline or line with only whitespace)
  const paragraphs = rawBriefText
    .split(/\n\s*\n|\r\n\s*\r\n/)
    .map(p => p.trim())
    .filter(p => p.length > 15) // Ignore very short lines

  if (paragraphs.length === 0) return null

  // Score each paragraph
  const scored = paragraphs.map(paragraph => {
    const lower = paragraph.toLowerCase()
    let score = 0
    for (const kw of keywords) {
      // Count occurrences (case-insensitive)
      const regex = new RegExp(kw, 'gi')
      const matches = lower.match(regex)
      if (matches) score += matches.length
    }
    return { paragraph, score }
  })

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score)

  // Filter to paragraphs with score > 0
  const relevant = scored.filter(s => s.score > 0)
  if (relevant.length === 0) return null

  // Take top paragraphs up to maxLength
  let result = ''
  for (const { paragraph } of relevant) {
    if (result.length + paragraph.length > maxLength && result.length > 0) break
    result += (result ? '\n\n' : '') + paragraph
  }

  return result || null
}
