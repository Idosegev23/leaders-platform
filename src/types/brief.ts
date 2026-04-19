// Types for data extracted from uploaded client brief + kickoff documents

export interface ExtractedBriefData {
  brand: {
    name: string
    officialName?: string
    background: string
    industry: string
    subIndustry?: string
    website?: string
    tagline?: string
  }

  budget: {
    amount: number
    currency: string // defaults to '₪'
    breakdown?: string
  }

  campaignGoals: string[]

  targetAudience: {
    primary: {
      gender: string
      ageRange: string
      socioeconomic?: string
      lifestyle?: string
      interests: string[]
      painPoints: string[]
    }
    secondary?: {
      gender: string
      ageRange: string
      description: string
    }
    behavior?: string
  }

  keyInsight?: string
  insightSource?: string
  strategyDirection?: string
  creativeDirection?: string

  // Rich creative context extracted from the brief (not just one-liners)
  brandStory?: string                  // סיפור המותג / נרטיב
  toneOfManner?: string                // טון ומניירה
  visualDirection?: string             // כיווני נראות / מילות מפתח ויזואליות
  mandatories?: string[]               // must-haves (לוגו, CTA, משפטים חובה)
  prohibitions?: string[]              // אסור (נושאים/מילים/משפיענים)
  referencedCampaigns?: string[]       // קמפיינים שהלקוח הזכיר כרפרנס
  previousCampaigns?: string[]         // קמפיינים קודמים של המותג
  keyMessages?: string[]               // מסרים מרכזיים
  contentPillars?: string[]            // עמודי תוכן

  deliverables?: {
    type: string
    quantity?: number
    description?: string
  }[]

  influencerPreferences?: {
    types?: string[]
    specificNames?: string[]
    criteria?: string[]
    verticals?: string[]
  }

  timeline?: {
    startDate?: string
    endDate?: string
    duration?: string
    milestones?: string[]
  }

  additionalNotes?: string[]

  successMetrics?: string[]
  clientSpecificRequests?: string[]
  competitorMentions?: string[]

  brandTone?: string
  gaps?: string[]

  _meta: {
    confidence: 'high' | 'medium' | 'low'
    clientBriefProcessed: boolean
    kickoffDocProcessed: boolean
    warnings: string[]
    extractionNotes?: string
  }
}

// Document upload state for the UI
export interface UploadedDocument {
  id: string
  type: 'client_brief' | 'kickoff'
  format: 'pdf' | 'docx' | 'image' | 'google_docs'
  status: 'pending' | 'uploading' | 'uploaded' | 'parsing' | 'parsed' | 'error'
  fileName?: string
  storageUrl?: string
  parsedText?: string
  error?: string
  googleDocsUrl?: string
}

// Parser output
export interface ParsedDocument {
  text: string
  metadata: {
    pageCount?: number
    format: string
    language?: string
    hasImages: boolean
    hasTables: boolean
  }
}
