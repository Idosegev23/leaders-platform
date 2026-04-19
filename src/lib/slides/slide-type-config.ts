/**
 * Slide type labels in Hebrew for the editor panel header.
 * Maps slide index to a descriptive label.
 */

const SLIDE_TYPE_LABELS: Record<number, string> = {
  0: 'שער',
  1: 'למה התכנסנו?',
  2: 'מטרות הקמפיין',
  3: 'קהל היעד',
  4: 'התובנה המרכזית',
  5: 'האסטרטגיה',
  6: 'הרעיון המרכזי',
  7: 'הגישה שלנו',
  8: 'תוצרים',
  9: 'יעדים ומדדים',
  10: 'אסטרטגיית משפיענים',
  11: 'משפיענים מומלצים',
  12: 'סיום',
}

export function getSlideLabel(index: number): string {
  return SLIDE_TYPE_LABELS[index] || `שקף ${index + 1}`
}
