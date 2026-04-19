import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Format currency in Israeli Shekels
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

// Format date in Hebrew
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('he-IL', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(d)
}

// Format short date
export function formatShortDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('he-IL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

// Generate unique ID
export function generateId(): string {
  return crypto.randomUUID()
}

// Generate quote number
export function generateQuoteNumber(): string {
  const date = new Date()
  const year = date.getFullYear().toString().slice(-2)
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
  return `Q${year}${month}-${random}`
}

// Calculate quote totals
export function calculateQuoteTotals(
  items: { qty: number; unitPrice: number }[],
  vatEnabled: boolean,
  vatRate: number = 17
) {
  const subtotal = items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0)
  const vatAmount = vatEnabled ? subtotal * (vatRate / 100) : 0
  const total = subtotal + vatAmount

  return {
    subtotal,
    vatAmount,
    total,
  }
}

// Truncate text with ellipsis
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 3) + '...'
}

// Validate email
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

// Validate Israeli phone number
export function isValidIsraeliPhone(phone: string): boolean {
  const phoneRegex = /^0[2-9]\d{7,8}$/
  const cleanPhone = phone.replace(/[-\s]/g, '')
  return phoneRegex.test(cleanPhone)
}

// Format phone number
export function formatPhone(phone: string): string {
  const cleanPhone = phone.replace(/[-\s]/g, '')
  if (cleanPhone.length === 10) {
    return `${cleanPhone.slice(0, 3)}-${cleanPhone.slice(3, 6)}-${cleanPhone.slice(6)}`
  }
  if (cleanPhone.length === 9) {
    return `${cleanPhone.slice(0, 2)}-${cleanPhone.slice(2, 5)}-${cleanPhone.slice(5)}`
  }
  return phone
}

// Delay utility for animations
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Get initials from name
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

// Document status labels in Hebrew
export const statusLabels: Record<string, string> = {
  draft: 'טיוטה',
  preview: 'תצוגה מקדימה',
  generated: 'נוצר',
  archived: 'בארכיון',
}

// Document type labels in Hebrew
export const documentTypeLabels: Record<string, string> = {
  quote: 'הצעת מחיר',
  deck: 'מצגת קריאטיב',
}

// Template style labels in Hebrew
export const styleLabels: Record<string, string> = {
  minimal: 'מינימליסטי',
  bold: 'בולט',
  premium: 'פרימיום',
}

// Slide type labels in Hebrew
export const slideTypeLabels: Record<string, string> = {
  title: 'כותרת',
  context: 'הקשר',
  audience: 'קהל יעד',
  big_idea: 'הרעיון הגדול',
  image_focus: 'תמונה מרכזית',
  moodboard: 'לוח השראה',
  comparison: 'השוואה',
  summary: 'סיכום',
  // JSON AST slide types
  cover: 'שער',
  brief: 'למה התכנסנו?',
  goals: 'מטרות הקמפיין',
  insight: 'התובנה המרכזית',
  whyNow: 'למה עכשיו?',
  strategy: 'האסטרטגיה',
  competitive: 'נוף תחרותי',
  bigIdea: 'הרעיון המרכזי',
  approach: 'הגישה שלנו',
  deliverables: 'תוצרים',
  metrics: 'יעדים ומדדים',
  influencerStrategy: 'אסטרטגיית משפיענים',
  contentStrategy: 'אסטרטגיית תוכן',
  influencers: 'משפיענים מומלצים',
  timeline: 'מפת דרכים',
  closing: 'סיום',
}





