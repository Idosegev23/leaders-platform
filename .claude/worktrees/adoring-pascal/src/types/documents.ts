import type { SlideType } from './database'

// Quote document data structure
export interface QuoteData {
  type: 'quote'
  client: {
    name: string
    email?: string
    phone?: string
    company?: string
    address?: string
  }
  supplier: {
    name: string
    phone?: string
    email?: string
    logoUrl?: string
    address?: string
    taxId?: string
  }
  quote: {
    id: string
    date: string
    validUntil: string
    vatEnabled: boolean
    vatRate: number
    paymentTerms: string
    items: QuoteItem[]
    notes: string
    signatureEnabled: boolean
  }
}

export interface QuoteItem {
  id: string
  title: string
  description?: string
  qty: number
  unitPrice: number
}

// Creative deck data structure
export interface DeckData {
  type: 'creative_deck'
  deck: {
    title: string
    subtitle?: string
    slides: Slide[]
    style: 'minimal' | 'bold' | 'premium'
  }
}

export interface Slide {
  id: string
  type: SlideType
  headline?: string
  subheadline?: string
  content?: string
  bullets?: string[]
  images?: SlideImage[]
  comparison?: ComparisonData
}

export interface SlideImage {
  url: string
  alt?: string
  prompt?: string
  source: 'upload' | 'nano_banana'
}

export interface ComparisonData {
  before: {
    title: string
    items: string[]
  }
  after: {
    title: string
    items: string[]
  }
}

// Chat message structure
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  metadata?: {
    step?: string
    field?: string
    options?: string[]
  }
}

// Template configuration
export interface TemplateColors {
  primary: string
  secondary: string
  accent: string
  background: string
  text: string
}

export interface TemplateFonts {
  heading: string
  body: string
  accent: string
}

export interface TemplateConfig {
  colors: TemplateColors
  fonts: TemplateFonts
  logoUrl?: string
  headerConfig?: {
    showLogo: boolean
    showDate: boolean
    showPageNumbers: boolean
  }
  footerConfig?: {
    text?: string
    showPageNumbers: boolean
  }
}





