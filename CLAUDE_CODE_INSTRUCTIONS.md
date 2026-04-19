# הוראות שיפור מקיפות לפרויקט DocMaker (pptmaker)

> **מסמך זה מכיל את כל השיפורים הנדרשים בפרויקט, מסודרים לפי עדיפות.**  
> **יש לבצע כל שלב בנפרד, לוודא שהקוד עובד, ולעבור לשלב הבא.**  
> **שפת תקשורת: עברית. שפת קוד: אנגלית.**

---

## מבנה הפרויקט

```
pptmaker/
├── src/
│   ├── app/           # Next.js App Router pages + API routes
│   ├── components/    # React components
│   ├── hooks/         # Custom React hooks
│   ├── lib/           # Business logic, AI modules, utils
│   ├── templates/     # Quote/deck templates
│   ├── types/         # TypeScript types
│   └── middleware.ts   # Auth middleware
├── public/
├── next.config.js
├── package.json
└── SYSTEM_SPECIFICATION.md
```

**Stack:** Next.js 14, React 18, TypeScript, Tailwind CSS, Supabase, Google Gemini, OpenAI, Apify, Puppeteer/Playwright

---

## פאזה 1: תיקוני אבטחה קריטיים

### 1.1 תיקון Admin Auto-Promotion — פרצת הרשאות

**קובץ:** `src/app/api/auth/callback/route.ts`

**הבעיה:** בשורה 7 יש:
```typescript
const ADMIN_EMAIL_KEYWORDS = ['cto', 'yoav']
```
כל מי שיוצר מייל עם המילים האלה (למשל `fake_cto@gmail.com`) מקבל הרשאות אדמין אוטומטית. זה privilege escalation vulnerability.

**הפתרון:** להחליף את מנגנון ה-substring match ברשימת מיילים מפורשת שנשלפת מ-environment variable:

```typescript
// שורה 7 - להחליף את:
const ADMIN_EMAIL_KEYWORDS = ['cto', 'yoav']

// ב:
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean)
```

ואת הבדיקה בשורה 44 להחליף מ:
```typescript
const isAdmin = ADMIN_EMAIL_KEYWORDS.some(kw => emailLower.includes(kw))
```
ל:
```typescript
const isAdmin = ADMIN_EMAILS.includes(emailLower)
```

**נדרש גם:** להוסיף ל-`.env.local`:
```
ADMIN_EMAILS=yoav@triroars.com,cto@triroars.com
```

---

### 1.2 הגנת SSRF ב-Scrape ו-URL Fetching

**קבצים:**
- `src/app/api/scrape/route.ts`
- `src/lib/apify/fetch-scraper.ts`

**הבעיה:** כל URL שהמשתמש שולח מועבר ישירות ל-`fetch()` ללא אימות. אפשר לשלוח `http://localhost:3000/api/admin/config` או `http://169.254.169.254/latest/meta-data/` (AWS metadata) ולגשת לשירותים פנימיים.

**הפתרון:** ליצור utility function חדש ב-`src/lib/utils/url-validator.ts`:

```typescript
import { URL } from 'url'

const BLOCKED_HOSTNAMES = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '169.254.169.254', // AWS metadata
  'metadata.google.internal', // GCP metadata
  '10.',
  '172.16.', '172.17.', '172.18.', '172.19.',
  '172.20.', '172.21.', '172.22.', '172.23.',
  '172.24.', '172.25.', '172.26.', '172.27.',
  '172.28.', '172.29.', '172.30.', '172.31.',
  '192.168.',
]

export function validateExternalUrl(input: string): string {
  let urlStr = input.trim()
  if (!urlStr.startsWith('http://') && !urlStr.startsWith('https://')) {
    urlStr = `https://${urlStr}`
  }

  const parsed = new URL(urlStr)

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only HTTP and HTTPS URLs are allowed')
  }

  const hostname = parsed.hostname.toLowerCase()
  for (const blocked of BLOCKED_HOSTNAMES) {
    if (hostname === blocked || hostname.startsWith(blocked)) {
      throw new Error('URL points to internal/private network — blocked')
    }
  }

  if (hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new Error('URL points to local/internal domain — blocked')
  }

  return parsed.href
}
```

**אחרי יצירת הקובץ**, לעדכן:

1. **`src/app/api/scrape/route.ts`** — להוסיף בתחילת ה-POST handler, אחרי `const { url } = body`:
```typescript
import { validateExternalUrl } from '@/lib/utils/url-validator'

// בתוך ה-handler, אחרי const { url } = body:
let validatedUrl: string
try {
  validatedUrl = validateExternalUrl(url)
} catch {
  return NextResponse.json({ error: 'Invalid or blocked URL' }, { status: 400 })
}
```
ולהשתמש ב-`validatedUrl` במקום `url` בקריאה ל-`fetchScrape`.

2. **`src/lib/apify/fetch-scraper.ts`** — להוסיף בתחילת `fetchScrape`:
```typescript
import { validateExternalUrl } from '@/lib/utils/url-validator'

export async function fetchScrape(url: string): Promise<EnhancedScrapeResult> {
  url = validateExternalUrl(url) // הוסיפו שורה זו
  // ... המשך הקוד
```

3. **לוגו URLs** — באותו אופן, בקבצים הבאים להוסיף validation לפני fetch של logo URL:
   - `src/lib/gemini/israeli-image-generator.ts` — בפונקציה שמביאה לוגו
   - `src/lib/gemini/logo-designer.ts` — בפונקציה `fetchImageAsBase64`
   - `src/lib/gemini/color-extractor.ts` — בפונקציה שמביאה תמונת לוגו

---

### 1.3 הגנת Dev Mode בפרודקשן

**קבצים:**
- `src/lib/auth/dev-mode.ts`
- `src/lib/supabase/middleware.ts`

**הבעיה:** אם `NEXT_PUBLIC_DEV_MODE=true` נשאר בפרודקשן, כל מנגנון ה-auth מושבת. כל אחד יכול לגשת לכל דף כולל admin.

**הפתרון:** להוסיף בדיקת בטיחות ב-`src/lib/auth/dev-mode.ts`:

```typescript
// להוסיף בתחילת הקובץ, אחרי export const isDevMode:
if (isDevMode && process.env.NODE_ENV === 'production') {
  console.error(
    '🚨 CRITICAL: NEXT_PUBLIC_DEV_MODE=true in production! Auth is BYPASSED. ' +
    'Remove this env var immediately.'
  )
}
```

**בנוסף**, ב-`src/lib/supabase/middleware.ts` — לשנות את שורה 11:
```typescript
// מ:
if (isDevMode) {
  return NextResponse.next({ request })
}

// ל:
if (isDevMode && process.env.NODE_ENV !== 'production') {
  return NextResponse.next({ request })
}
```

---

### 1.4 הוספת Authentication ל-API Routes חשופים

**קבצים שצריכים auth:**
- `src/app/api/parse-document/route.ts`
- `src/app/api/upload/route.ts`
- `src/app/api/scrape/route.ts`
- `src/app/api/ai-assist/route.ts`
- `src/app/api/feedback/route.ts`

**הפתרון:** ליצור auth middleware helper ב-`src/lib/auth/api-auth.ts`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { isDevMode, DEV_USER } from '@/lib/auth/dev-mode'

export async function getAuthenticatedUser() {
  if (isDevMode && process.env.NODE_ENV !== 'production') {
    return { id: DEV_USER.id, email: DEV_USER.email }
  }

  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return null
  }

  return { id: user.id, email: user.email }
}
```

**לאחר מכן**, בכל אחד מה-5 קבצים שלמעלה, להוסיף בתחילת ה-POST handler:

```typescript
import { getAuthenticatedUser } from '@/lib/auth/api-auth'

// בתחילת ה-handler:
const user = await getAuthenticatedUser()
if (!user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```

---

### 1.5 Upload Route — הוספת File Validation

**קובץ:** `src/app/api/upload/route.ts`

**הבעיה:** אין בדיקת גודל קובץ ואין בדיקת סוג קובץ. כל אחד יכול להעלות קבצים ללא הגבלה.

**הפתרון:** להוסיף אחרי שורה 13 (`if (!file) { ... }`):

```typescript
const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB
const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]

if (file.size > MAX_FILE_SIZE) {
  return NextResponse.json(
    { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.` },
    { status: 400 }
  )
}

if (!ALLOWED_MIME_TYPES.includes(file.type)) {
  return NextResponse.json(
    { error: `File type "${file.type}" is not allowed.` },
    { status: 400 }
  )
}
```

---

## פאזה 2: שיפורי TypeScript ו-Error Handling

### 2.1 ביטול `any` Types — יצירת Interfaces חסרים

**ליצור קובץ חדש:** `src/types/ai-config.ts`

```typescript
export interface AIModelConfig {
  primaryModel: string
  fallbackModel: string
  temperature?: number
  maxOutputTokens?: number
  timeout?: number
}

export interface BrandResearchFull {
  brandName: string
  industry: string
  tagline?: string
  description?: string
  targetAudience?: string
  values?: string[]
  competitors?: string[]
  competitorCampaigns?: Array<{
    brand: string
    campaign: string
    description: string
  }>
  whyNowTrigger?: string
  dominantPlatformInIsrael?: string
  israeliMarketInsights?: string
  uniqueSellingPoints?: string[]
  brandVoice?: string
  colors?: {
    primary: string
    secondary: string
    accent: string
  }
}

export interface ImageGenerationConfig {
  imageModel: string
  imageSize?: string
  aspectRatio?: string
  numberOfImages?: number
}
```

**לאחר מכן**, לתקן את הקבצים הבאים — להחליף `any` ב-types מתאימים:

1. **`src/lib/gemini/creative-enhancer.ts`** — להחליף `(brandResearch as any).competitorCampaigns` ב-`(brandResearch as BrandResearchFull).competitorCampaigns`
2. **`src/lib/gemini/influencer-research.ts`** — להחליף `(brandResearch as any).dominantPlatformInIsrael` ב-`(brandResearch as BrandResearchFull).dominantPlatformInIsrael`
3. **`src/lib/gemini/image.ts`** — להחליף `config: any` ב-`config: ImageGenerationConfig`
4. **`src/lib/gemini/proposal-images.ts`** — להחליף `config: any` ב-`config: ImageGenerationConfig`
5. **`src/lib/gemini/imagen.ts`** — להחליף `config: any` ב-`config: ImageGenerationConfig`
6. **`src/lib/gemini/proposal-agent.ts`** — להגדיר return type ברור ל-`extractFromBrief` במקום `any`

---

### 2.2 Error Handling אחיד — Toast במקום alert()

**קבצים שמשתמשים ב-`alert()`:**
- `src/app/create/page.tsx`
- `src/app/create-auto/page.tsx`
- `src/app/preview/[id]/page.tsx`

**הפתרון:**

**שלב א:** ליצור toast component ב-`src/components/ui/toast.tsx`:

```tsx
'use client'

import { useState, useEffect, createContext, useContext, useCallback, ReactNode } from 'react'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  message: string
  type: ToastType
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextType>({ showToast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = `toast-${Date.now()}`
    setToasts(prev => [...prev, { id, message, type }])
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 left-4 z-[9999] flex flex-col gap-2" dir="rtl">
        {toasts.map(toast => (
          <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onRemove(toast.id), 5000)
    return () => clearTimeout(timer)
  }, [toast.id, onRemove])

  const bgColor = {
    success: 'bg-green-600',
    error: 'bg-red-600',
    warning: 'bg-yellow-600',
    info: 'bg-blue-600',
  }[toast.type]

  return (
    <div className={`${bgColor} text-white px-4 py-3 rounded-lg shadow-lg max-w-sm animate-slide-up`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm">{toast.message}</span>
        <button onClick={() => onRemove(toast.id)} className="text-white/70 hover:text-white">✕</button>
      </div>
    </div>
  )
}
```

**שלב ב:** לעטוף את ה-layout ב-`src/app/layout.tsx`:
```tsx
// להוסיף import:
import { ToastProvider } from '@/components/ui/toast'

// לעטוף את children ב-body:
<body>
  <ToastProvider>
    {children}
  </ToastProvider>
</body>
```

**שלב ג:** בכל אחד מ-3 הקבצים שמשתמשים ב-`alert()`, להחליף:
```typescript
// מ:
alert('שגיאה כלשהי')

// ל:
import { useToast } from '@/components/ui/toast'
// בתוך הקומפוננט:
const { showToast } = useToast()
// בטיפול בשגיאה:
showToast('שגיאה כלשהי', 'error')
```

---

### 2.3 הוספת Error Boundary גלובלי

**ליצור:** `src/app/error.tsx`

```tsx
'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background" dir="rtl">
      <div className="text-center space-y-4 p-8">
        <h2 className="text-2xl font-bold text-white">משהו השתבש</h2>
        <p className="text-white/60">{error.message || 'אירעה שגיאה בלתי צפויה'}</p>
        <button
          onClick={reset}
          className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/80 transition-colors"
        >
          נסה שוב
        </button>
      </div>
    </div>
  )
}
```

---

## פאזה 3: שיפורי ארכיטקטורה

### 3.1 פיצול `slide-designer.ts` (2000 שורות)

**קובץ:** `src/lib/gemini/slide-designer.ts`

**הבעיה:** הקובץ מכיל ~2000 שורות עם 4 תחומי אחריות שונים מעורבים יחד.

**הפתרון:** לפצל ל-4 קבצים:

1. **`src/lib/gemini/slides/design-system.ts`** — הפונקציות שמייצרות את ה-design system:
   - `generateDesignSystem()`
   - `getDesignSystemSchema()`
   - `getFallbackDesignSystem()`
   - כל הסכמות של DesignSystem

2. **`src/lib/gemini/slides/batch-generator.ts`** — הפונקציות שמייצרות batches של slides:
   - `generateSlideBatch()`
   - `buildSlidePrompt()`
   - `getSlideSchema()`
   - `getFallbackSlides()`

3. **`src/lib/gemini/slides/validation.ts`** — כל ה-validation ו-auto-fix:
   - `validateSlideAST()`
   - `autoFixSlide()`
   - `checkContrast()`
   - `checkSafeZone()`
   - `checkImageBounds()`
   - `luminance()`, `contrastRatio()`

4. **`src/lib/gemini/slides/helpers.ts`** — utility functions:
   - `parseGeminiResponse()`
   - `getAppBaseUrl()`
   - `injectLeadersLogo()`
   - `CLIENT_LOGO_SLIDES`
   - קבועים (canvas sizes, safe zones)

5. **`src/lib/gemini/slides/index.ts`** — re-exports הכל תחת אותם שמות:
   ```typescript
   export { generateDesignSystem } from './design-system'
   export { generateSlideBatch } from './batch-generator'
   export { validateSlideAST, autoFixSlide } from './validation'
   // ... etc
   ```

**חשוב:** לא לשנות את ה-API החיצוני. הקובץ `src/lib/gemini/slide-designer.ts` צריך להמשיך לייצא את אותן פונקציות, או שכל הקבצים שמייבאים ממנו צריכים להתעדכן.

**קבצים שמייבאים מ-`slide-designer.ts`:** לחפש import מ-`slide-designer` בכל הפרויקט ולעדכן.

---

### 3.2 פיצול `create-proposal/page.tsx` (895 שורות)

**קובץ:** `src/app/create-proposal/page.tsx`

**הפתרון:** לפצל ל:

1. **`src/hooks/use-proposal-creation.ts`** — כל הלוגיקה (state, handlers, effects):
   - `files`, `stage`, `error`, `logs`, `brandInfo`, `elapsed`
   - `handleFileUpload`, `handleGoogleDocsLink`, `handleSubmit`
   - Processing pipeline logic

2. **`src/components/create-proposal/file-upload-zone.tsx`** — Drag & drop area

3. **`src/components/create-proposal/processing-terminal.tsx`** — Terminal-style logs

4. **`src/components/create-proposal/brand-card.tsx`** — Brand info card

5. **`src/components/create-proposal/progress-steps.tsx`** — Step indicators

6. **`src/app/create-proposal/page.tsx`** — מצומצם רק ל-composition:
   ```tsx
   export default function CreateProposalPage() {
     const { ... } = useProposalCreation()
     return (
       <Layout>
         <FileUploadZone ... />
         <ProcessingTerminal ... />
         <BrandCard ... />
         <ProgressSteps ... />
       </Layout>
     )
   }
   ```

---

### 3.3 פיצול `research/[id]/page.tsx` (900 שורות)

**קובץ:** `src/app/research/[id]/page.tsx`

**אותו עיקרון:**

1. **`src/hooks/use-research-pipeline.ts`** — כל הלוגיקה
2. **`src/components/research/agent-status-card.tsx`** — סטטוס כל agent
3. **`src/components/research/research-results.tsx`** — תוצאות מחקר
4. **`src/components/research/influencer-results.tsx`** — תוצאות influencers
5. **`src/app/research/[id]/page.tsx`** — composition בלבד

---

### 3.4 Layout Deduplication

**קבצים כפולים:**
- `src/app/dashboard/layout.tsx`
- `src/app/documents/layout.tsx`
- `src/app/preview/layout.tsx`

**הבעיה:** שלושתם מכילים לוגיקה כמעט זהה: auth check → DashboardNav → children.

**הפתרון:** ליצור shared layout ב-`src/components/layout/authenticated-layout.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isDevMode, DEV_USER } from '@/lib/auth/dev-mode'
import DashboardNav from '@/components/layout/dashboard-nav'

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let user = null

  if (isDevMode) {
    user = DEV_USER
  } else {
    const supabase = await createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) redirect('/login')

    const { data: profile } = await supabase
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .single()

    user = profile || { id: authUser.id, email: authUser.email, full_name: '', role: 'user' }
  }

  return (
    <>
      <DashboardNav user={user} />
      <main className="pt-16">{children}</main>
    </>
  )
}
```

ואז כל שלושת ה-layouts משתמשים בו:
```tsx
import AuthenticatedLayout from '@/components/layout/authenticated-layout'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <AuthenticatedLayout>{children}</AuthenticatedLayout>
}
```

---

## פאזה 4: שיפורי ביצועים ואיכות

### 4.1 Pagination למסמכים

**קובץ:** `src/app/documents/page.tsx`

**הבעיה:** הquery מושך את כל המסמכים ללא limit. עם הרבה משתמשים ומסמכים זה יהיה איטי.

**הפתרון:** להוסיף limit ו-pagination:

```typescript
// לשנות את ה-query מ:
const { data: documents } = await supabase
  .from('documents')
  .select('*')
  .eq('user_id', user.id)

// ל:
const PAGE_SIZE = 20
const { data: documents, count } = await supabase
  .from('documents')
  .select('*', { count: 'exact' })
  .eq('user_id', user.id)
  .order('updated_at', { ascending: false })
  .range(0, PAGE_SIZE - 1)
```

להוסיף pagination UI בתחתית הדף.

---

### 4.2 איחוד Gemini SDK

**הבעיה:** `src/lib/gemini/chat.ts` משתמש ב-`@google/generative-ai` (SDK ישן) עם המודל `gemini-pro` (כנראה deprecated). כל שאר הקבצים משתמשים ב-`@google/genai` (SDK חדש).

**קובץ:** `src/lib/gemini/chat.ts`

**הפתרון:** לשכתב את `chat.ts` להשתמש ב-`GoogleGenAI` מ-`@google/genai` במקום `GoogleGenerativeAI` מ-`@google/generative-ai`:

```typescript
// להחליף:
import { GoogleGenerativeAI } from '@google/generative-ai'

// ב:
import { GoogleGenAI } from '@google/genai'
```

ולעדכן את שם המודל ל:
```typescript
const model = await getConfig('ai_models', 'chat.model', 'gemini-2.5-flash-preview-05-20')
```

**לאחר מכן**, לבדוק אם אפשר להסיר את `@google/generative-ai` מ-`package.json` אם אף קובץ אחר לא משתמש בו.

---

### 4.3 העברת Hardcoded Models ל-Admin Config

**קבצים שמכילים models hardcoded במקום `getConfig()`:**
- `src/lib/gemini/image-strategist.ts` — `PRO_MODEL`, `FLASH_MODEL`
- `src/lib/gemini/smart-prompt-generator.ts` — `PRO_MODEL`, `FLASH_MODEL`
- `src/lib/gemini/color-extractor.ts` — models hardcoded
- `src/lib/gemini/logo-designer.ts` — models hardcoded
- `src/lib/gemini/imagen.ts` — `IMAGE_MODEL`
- `src/lib/gemini/israeli-image-generator.ts` — `IMAGE_MODEL`

**הפתרון:** בכל קובץ, להחליף:
```typescript
const PRO_MODEL = 'gemini-3.1-pro-preview'
```
ב:
```typescript
import { getConfig } from '@/lib/config/admin-config'

// בתוך הפונקציה:
const proModel = await getConfig('ai_models', 'image_strategist.primary_model', 'gemini-3.1-pro-preview')
```

**להוסיף defaults חדשים ב-`src/lib/config/defaults.ts`** עבור כל model key חדש.

---

### 4.4 הוספת `/research` ל-Protected Paths

**קובץ:** `src/lib/supabase/middleware.ts`

**הבעיה:** בשורה 60, `/research` לא נמצא ברשימת ה-protected paths:
```typescript
const protectedPaths = ['/dashboard', '/admin', '/create', '/documents', '/preview', '/create-proposal', '/wizard']
```

**הפתרון:** להוסיף:
```typescript
const protectedPaths = ['/dashboard', '/admin', '/create', '/documents', '/preview', '/create-proposal', '/wizard', '/research', '/generate', '/edit']
```

---

### 4.5 HTML Sanitization ב-AST-to-HTML

**קובץ:** `src/lib/presentation/ast-to-html.ts`

**הבעיה:** Image URLs לא מאומתים. `bg.value` ו-`el.src` יכולים להכיל `javascript:` URLs.

**הפתרון:** להוסיף פונקציית sanitization:

```typescript
function sanitizeUrl(url: string): string {
  if (!url) return ''
  const lower = url.trim().toLowerCase()
  if (lower.startsWith('javascript:') || lower.startsWith('data:text/html') || lower.startsWith('vbscript:')) {
    return ''
  }
  return url
}
```

ולהשתמש בה ב:
- `renderBackground` — `url('${sanitizeUrl(bg.value)}')`
- `renderImageElement` — `src="${sanitizeUrl(el.src)}"`

---

## פאזה 5: שיפורי UX/Accessibility

### 5.1 Accessibility ל-Navigation

**קובץ:** `src/components/layout/dashboard-nav.tsx`

**הפתרון:** להוסיף ARIA attributes:

```tsx
// כפתור תפריט מובייל:
<button
  onClick={() => setIsMenuOpen(!isMenuOpen)}
  aria-expanded={isMenuOpen}
  aria-label={isMenuOpen ? 'סגור תפריט' : 'פתח תפריט'}
  aria-controls="mobile-menu"
>

// תפריט מובייל:
<div id="mobile-menu" role="menu" aria-hidden={!isMenuOpen}>

// כל פריט בתפריט:
<a role="menuitem" ...>

// תפריט משתמש:
<button
  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
  aria-expanded={isUserMenuOpen}
  aria-label="תפריט משתמש"
  aria-haspopup="menu"
>
```

---

### 5.2 Loading States חסרים

**קבצים:**
- `src/app/dashboard/page.tsx` — אין loading UI
- `src/app/documents/page.tsx` — אין loading UI

**הפתרון:** ליצור `loading.tsx` עבור כל route:

**`src/app/dashboard/loading.tsx`:**
```tsx
import { Spinner } from '@/components/ui'

export default function DashboardLoading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Spinner size="lg" />
    </div>
  )
}
```

**`src/app/documents/loading.tsx`:** אותו דבר.

---

## פאזה 6: תיעוד

### 6.1 יצירת README.md

**ליצור:** `README.md` בשורש הפרויקט עם:
- שם הפרויקט ותיאור קצר
- דרישות מקדימות (Node.js, Supabase, API keys)
- התקנה והרצה (`npm install`, `npm run dev`)
- Environment Variables נדרשים (ללא ערכים אמיתיים)
- מבנה הפרויקט
- Stack טכנולוגי

### 6.2 יצירת `.cursorrules`

**ליצור:** `.cursorrules` בשורש הפרויקט עם:
- שפת פרויקט: עברית (UI), אנגלית (קוד)
- Patterns: App Router, Server/Client components, RTL
- AI modules use primary/fallback model pattern
- Admin config for prompts and models via `getConfig()`
- JSON parsing always through `parseGeminiJson()`
- Supabase for auth and data
- All API routes should have auth

---

## סדר ביצוע מומלץ

| שלב | פאזה | פריט | זמן משוער |
|------|-------|------|-----------|
| 1 | 1.1 | Admin auto-promotion fix | 5 דק |
| 2 | 1.3 | Dev mode production guard | 5 דק |
| 3 | 1.2 | SSRF protection (url-validator) | 15 דק |
| 4 | 1.4 | API auth middleware | 20 דק |
| 5 | 1.5 | Upload validation | 5 דק |
| 6 | 4.4 | Protected paths update | 2 דק |
| 7 | 4.5 | HTML URL sanitization | 5 דק |
| 8 | 2.2 | Toast component + replace alerts | 20 דק |
| 9 | 2.3 | Error boundary | 5 דק |
| 10 | 2.1 | TypeScript interfaces + fix any | 30 דק |
| 11 | 3.4 | Layout deduplication | 15 דק |
| 12 | 3.1 | Split slide-designer.ts | 45 דק |
| 13 | 3.2 | Split create-proposal/page.tsx | 30 דק |
| 14 | 3.3 | Split research/[id]/page.tsx | 30 דק |
| 15 | 4.1 | Documents pagination | 15 דק |
| 16 | 4.2 | Unify Gemini SDK | 15 דק |
| 17 | 4.3 | Models to admin config | 30 דק |
| 18 | 5.1 | Accessibility | 15 דק |
| 19 | 5.2 | Loading states | 10 דק |
| 20 | 6.1-6.2 | Documentation | 15 דק |

**סה"כ:** ~5-6 שעות עבודה

---

## הערות חשובות

1. **אחרי כל שינוי** — להריץ `npm run build` לוודא שאין שגיאות TypeScript.
2. **אחרי שינויי auth** — לבדוק שה-login flow עובד, ושדפים מוגנים מפנים ל-login.
3. **אחרי פיצול קבצים** — לבדוק שכל ה-imports עובדים ושאין circular dependencies.
4. **לא לשנות** את הלוגיקה העסקית או ה-prompts — רק refactoring, security, ו-quality.
5. **לשמור על backward compatibility** — כל re-export צריך לשמור על אותם שמות.
