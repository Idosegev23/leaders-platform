# Phase 1 — Reliable Rendering & Downloads — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the download-failure class — PDF and PPTX downloads always succeed, with no fidelity loss — by moving Chromium rendering out of the serverless function into Gotenberg and routing every download through Supabase Storage + a signed URL (never a direct buffer).

**Architecture:** A small render layer (`src/lib/render/*`) wraps a Gotenberg service (Docker, Chromium-based) that screenshots each slide HTML to PNG; `pdf-lib` assembles the PNGs into a PDF (preserving today's screenshot-fidelity approach — gradients/blur/glass survive). A storage helper uploads any artifact and returns a signed URL, throwing on error instead of swallowing it. The `/api/pdf` and `/api/export-pptx` routes are rewired to use these and to return a URL; clients download from the URL with specific error reporting. This phase keeps the existing slide *content* (HTML slides) untouched — only the render + download plumbing changes.

**Tech Stack:** Next.js 14 App Router, TypeScript, Gotenberg 8 (Docker), `pdf-lib` (already a dep), `pptxgenjs` (already a dep), Supabase Storage (`@supabase/supabase-js`, already a dep), `vitest` (added in Task 1), `tsx` (already a dev dep, for verification scripts).

## Global Constraints

- Node global `fetch`/`FormData`/`Blob` are available in the Next.js server runtime (Node 18+) — do **not** add `node-fetch` or `form-data`.
- Path alias: `@/*` → `./src/*` (verbatim from `tsconfig.json`).
- Service-role Supabase access from non-cookie contexts uses `createSupabaseService()` from `@/lib/research-hub/service` — reuse it; do not create a new service client.
- Storage bucket for deck artifacts: `documents` (already in use by `/api/pdf`).
- Slide canvas is `1920×1080` (16:9) — `CANVAS_WIDTH`/`CANVAS_HEIGHT` in `src/types/presentation.ts`.
- New env var: `GOTENBERG_URL` (default `http://localhost:3001` for local dev). Add to `.env.local` and all three Vercel environments before deploy.
- No direct file buffers in HTTP responses for downloads — every download returns JSON `{ url, fileName, sizeBytes }`; the browser fetches the file from `url`.
- Errors must surface: never `catch` an upload/render error and continue with a stale/empty result. Throw, and let the route return a 5xx with a specific message.
- This phase does NOT change slide generation, the wizard, research, or the AST/IR. Only render + download.

---

## File Structure

**Created:**
- `src/lib/render/gotenberg.ts` — Gotenberg client: `htmlToPng`, `pngsToPdf`, `htmlSlidesToPdf`. One responsibility: turn slide HTML into a PDF buffer via Gotenberg.
- `src/lib/render/storage.ts` — `uploadAndSignedUrl`: upload a buffer to Supabase Storage and return a signed URL; throws on failure.
- `src/lib/render/gotenberg.test.ts` — unit tests for `pngsToPdf` (pure, pdf-lib).
- `src/lib/render/storage.test.ts` — unit test for the storage-path builder `deckArtifactPath`.
- `vitest.config.ts` — test runner config with `@` alias.
- `docker/gotenberg/Dockerfile` — Gotenberg 8 image with Heebo fonts bundled (Hebrew RTL fidelity).
- `docker/gotenberg/docker-compose.yml` — local Gotenberg on port 3001.
- `scripts/verify-gotenberg.mjs` — integration check: HTML → Gotenberg → PDF, asserts a valid multi-page PDF.
- `scripts/verify-storage.mjs` — integration check: upload + signed URL round-trip.

**Modified:**
- `src/app/api/pdf/route.ts` — all three render paths use Gotenberg + `uploadAndSignedUrl`; remove `action==='download'` direct-buffer returns; stop swallowing upload errors.
- `src/app/api/export-pptx/route.ts` — upload PPTX to storage + return signed URL instead of a direct buffer.
- `src/app/preview/[id]/page.tsx` — PDF/PPTX download handlers consume `{ url }`, report specific errors, add an abort timeout.
- `.env.example` (create if missing) / `.env.local` — add `GOTENBERG_URL`.

---

## Task 1: Test runner setup (vitest)

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (devDependency + `test` script)

**Interfaces:**
- Produces: `npm test` runs vitest; tests can import from `@/...`.

- [ ] **Step 1: Install vitest**

Run: `npm i -D vitest@^2.1.8`
Expected: adds `vitest` to devDependencies, no peer-dep errors.

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
```

- [ ] **Step 3: Add `test` script to `package.json`**

In the `"scripts"` block, add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Add a smoke test and run it**

Create `src/lib/render/__smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
describe('vitest', () => {
  it('runs', () => { expect(1 + 1).toBe(2) })
})
```

Run: `npm test`
Expected: 1 passing test.

- [ ] **Step 5: Delete the smoke test and commit**

```bash
rm src/lib/render/__smoke.test.ts
git add vitest.config.ts package.json package-lock.json
git commit -m "test: add vitest runner with @ alias"
```

---

## Task 2: Gotenberg service (Docker, Heebo fonts)

**Files:**
- Create: `docker/gotenberg/Dockerfile`
- Create: `docker/gotenberg/docker-compose.yml`
- Create: `scripts/verify-gotenberg.mjs`
- Modify: `.env.local` (add `GOTENBERG_URL`)

**Interfaces:**
- Produces: a running Gotenberg on `GOTENBERG_URL` (default `http://localhost:3001`) with the screenshot endpoint `/forms/chromium/screenshot/html` and Heebo fonts installed.

- [ ] **Step 1: Write the Gotenberg Dockerfile with Heebo**

`docker/gotenberg/Dockerfile`:

```dockerfile
FROM gotenberg/gotenberg:8

USER root
# Bundle Hebrew web font (Heebo) so RTL slides render identically to the editor.
RUN mkdir -p /usr/share/fonts/truetype/heebo
ADD https://github.com/google/fonts/raw/main/ofl/heebo/Heebo%5Bwght%5D.ttf /usr/share/fonts/truetype/heebo/Heebo.ttf
RUN chmod 644 /usr/share/fonts/truetype/heebo/Heebo.ttf && fc-cache -f
USER gotenberg
```

- [ ] **Step 2: Write docker-compose for local dev**

`docker/gotenberg/docker-compose.yml`:

```yaml
services:
  gotenberg:
    build: .
    ports:
      - "3001:3000"
    restart: unless-stopped
    command:
      - "gotenberg"
      - "--chromium-disable-web-security"      # load cross-origin images (matches current puppeteer flag)
      - "--api-timeout=120s"
```

- [ ] **Step 3: Build and run Gotenberg**

Run: `cd docker/gotenberg && docker compose up -d --build`
Expected: container healthy; `curl -s http://localhost:3001/health` returns `{"status":"up",...}`.

- [ ] **Step 4: Add `GOTENBERG_URL` to env**

Append to `.env.local`:

```
GOTENBERG_URL=http://localhost:3001
```

- [ ] **Step 5: Write the integration verification script**

`scripts/verify-gotenberg.mjs`:

```js
// Run: node scripts/verify-gotenberg.mjs
const URL = process.env.GOTENBERG_URL || 'http://localhost:3001'
const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<style>html,body{margin:0}.slide{width:1920px;height:1080px;display:flex;align-items:center;
justify-content:center;background:linear-gradient(135deg,#1a1a2e,#E94560);color:#fff;
font:700 120px Heebo,sans-serif}</style></head>
<body><div class="slide">שלום עולם</div></body></html>`

const form = new FormData()
form.append('files', new Blob([html], { type: 'text/html' }), 'index.html')
form.append('width', '1920')
form.append('height', '1080')
form.append('format', 'png')
form.append('waitDelay', '1s')

const res = await fetch(`${URL}/forms/chromium/screenshot/html`, { method: 'POST', body: form })
if (!res.ok) { console.error('FAIL', res.status, await res.text()); process.exit(1) }
const buf = Buffer.from(await res.arrayBuffer())
if (buf.length < 5000 || buf.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
  console.error('FAIL: not a PNG or too small', buf.length); process.exit(1)
}
console.log('OK: Gotenberg screenshot PNG', buf.length, 'bytes')
```

Run: `node scripts/verify-gotenberg.mjs`
Expected: `OK: Gotenberg screenshot PNG <N> bytes` (N > 5000).

- [ ] **Step 6: Commit**

```bash
git add docker/gotenberg scripts/verify-gotenberg.mjs
git commit -m "infra: Gotenberg service with Heebo fonts + verify script"
```

---

## Task 3: Gotenberg render client (`src/lib/render/gotenberg.ts`)

**Files:**
- Create: `src/lib/render/gotenberg.ts`
- Test: `src/lib/render/gotenberg.test.ts`

**Interfaces:**
- Consumes: `GOTENBERG_URL` env; `pdf-lib` `PDFDocument`.
- Produces:
  - `htmlToPng(html: string, opts?: { width?: number; height?: number; waitDelay?: string }): Promise<Buffer>`
  - `pngsToPdf(pngs: Buffer[], meta?: { title?: string; brandName?: string }): Promise<Buffer>`
  - `htmlSlidesToPdf(slides: string[], meta?: { title?: string; brandName?: string }): Promise<Buffer>`

- [ ] **Step 1: Write the failing test for `pngsToPdf`**

`src/lib/render/gotenberg.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { pngsToPdf } from './gotenberg'

async function tinyPng(): Promise<Buffer> {
  // 1x1 transparent PNG embedded into a doc just to get valid PNG bytes
  const doc = await PDFDocument.create()
  // Build a minimal valid PNG via a known base64 1x1 transparent pixel
  const b64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
  return Buffer.from(b64, 'base64')
}

describe('pngsToPdf', () => {
  it('produces a PDF with one 1920x1080 page per PNG', async () => {
    const png = await tinyPng()
    const pdfBuf = await pngsToPdf([png, png, png], { title: 'T', brandName: 'B' })
    const pdf = await PDFDocument.load(pdfBuf)
    expect(pdf.getPageCount()).toBe(3)
    const { width, height } = pdf.getPage(0).getSize()
    expect(Math.round(width)).toBe(1920)
    expect(Math.round(height)).toBe(1080)
    expect(pdf.getTitle()).toBe('T')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/render/gotenberg.test.ts`
Expected: FAIL — `pngsToPdf` is not exported / module not found.

- [ ] **Step 3: Implement `src/lib/render/gotenberg.ts`**

```ts
import { PDFDocument } from 'pdf-lib'

const GOTENBERG_URL = process.env.GOTENBERG_URL || 'http://localhost:3001'
const SLIDE_W = 1920
const SLIDE_H = 1080

/** Screenshot one full-slide HTML document to a PNG via Gotenberg's Chromium.
 *  Screenshot (not print) preserves gradients/blur/glass — matching the
 *  previous puppeteer screenshot approach. */
export async function htmlToPng(
  html: string,
  opts: { width?: number; height?: number; waitDelay?: string } = {},
): Promise<Buffer> {
  const form = new FormData()
  form.append('files', new Blob([html], { type: 'text/html' }), 'index.html')
  form.append('width', String(opts.width ?? SLIDE_W))
  form.append('height', String(opts.height ?? SLIDE_H))
  form.append('format', 'png')
  // Give web fonts + images time to settle (mirrors the old 1200ms font wait).
  form.append('waitDelay', opts.waitDelay ?? '1.2s')

  const res = await fetch(`${GOTENBERG_URL}/forms/chromium/screenshot/html`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Gotenberg screenshot failed (${res.status}): ${detail.slice(0, 300)}`)
  }
  return Buffer.from(await res.arrayBuffer())
}

/** Assemble per-slide PNGs into a single 16:9 PDF (one page per PNG). */
export async function pngsToPdf(
  pngs: Buffer[],
  meta: { title?: string; brandName?: string } = {},
): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  for (const png of pngs) {
    const img = await pdf.embedPng(png)
    const page = pdf.addPage([SLIDE_W, SLIDE_H])
    page.drawImage(img, { x: 0, y: 0, width: SLIDE_W, height: SLIDE_H })
  }
  pdf.setTitle(meta.title || 'Presentation')
  pdf.setAuthor(meta.brandName || 'Leaders')
  pdf.setCreator('Leaders — Gotenberg render')
  pdf.setCreationDate(new Date())
  const bytes = await pdf.save()
  return Buffer.from(bytes)
}

/** Full path: array of slide HTML docs → PDF buffer. */
export async function htmlSlidesToPdf(
  slides: string[],
  meta: { title?: string; brandName?: string } = {},
): Promise<Buffer> {
  if (slides.length === 0) throw new Error('htmlSlidesToPdf: no slides provided')
  const pngs: Buffer[] = []
  for (const slide of slides) {
    pngs.push(await htmlToPng(slide))
  }
  return pngsToPdf(pngs, meta)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/lib/render/gotenberg.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/render/gotenberg.ts src/lib/render/gotenberg.test.ts
git commit -m "feat(render): Gotenberg client — html→png→pdf with screenshot fidelity"
```

---

## Task 4: Storage upload + signed URL helper (`src/lib/render/storage.ts`)

**Files:**
- Create: `src/lib/render/storage.ts`
- Test: `src/lib/render/storage.test.ts`
- Create: `scripts/verify-storage.mjs`

**Interfaces:**
- Consumes: `createSupabaseService` from `@/lib/research-hub/service`.
- Produces:
  - `deckArtifactPath(documentId: string, kind: 'pdf' | 'pptx', ts?: number): string` — pure path builder.
  - `uploadAndSignedUrl(args: { bucket?: string; path: string; body: Buffer; contentType: string; expiresIn?: number }): Promise<{ signedUrl: string; path: string }>` — throws on failure.

- [ ] **Step 1: Write the failing test for `deckArtifactPath`**

`src/lib/render/storage.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { deckArtifactPath } from './storage'

describe('deckArtifactPath', () => {
  it('builds a deterministic path with the kind extension', () => {
    expect(deckArtifactPath('doc-123', 'pdf', 1000)).toBe('decks/doc-123/1000.pdf')
    expect(deckArtifactPath('doc-123', 'pptx', 2000)).toBe('decks/doc-123/2000.pptx')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/render/storage.test.ts`
Expected: FAIL — `deckArtifactPath` not exported.

- [ ] **Step 3: Implement `src/lib/render/storage.ts`**

```ts
import { createSupabaseService } from '@/lib/research-hub/service'

const DEFAULT_BUCKET = 'documents'
const DEFAULT_EXPIRY_SECONDS = 60 * 60 * 24 * 7 // 7 days

/** Deterministic storage key for a deck artifact. `ts` defaults to now. */
export function deckArtifactPath(
  documentId: string,
  kind: 'pdf' | 'pptx',
  ts: number = Date.now(),
): string {
  return `decks/${documentId}/${ts}.${kind}`
}

/** Upload a buffer and return a signed URL. Throws (never swallows) on failure
 *  so the caller's route returns a real 5xx instead of a dead URL. */
export async function uploadAndSignedUrl(args: {
  bucket?: string
  path: string
  body: Buffer
  contentType: string
  expiresIn?: number
}): Promise<{ signedUrl: string; path: string }> {
  const bucket = args.bucket ?? DEFAULT_BUCKET
  const sb = createSupabaseService()

  const { error: upErr } = await sb.storage
    .from(bucket)
    .upload(args.path, args.body, { contentType: args.contentType, upsert: true })
  if (upErr) {
    throw new Error(`storage upload failed (${bucket}/${args.path}): ${upErr.message}`)
  }

  const { data, error: signErr } = await sb.storage
    .from(bucket)
    .createSignedUrl(args.path, args.expiresIn ?? DEFAULT_EXPIRY_SECONDS)
  if (signErr || !data?.signedUrl) {
    throw new Error(
      `createSignedUrl failed (${bucket}/${args.path}): ${signErr?.message ?? 'no url returned'}`,
    )
  }
  return { signedUrl: data.signedUrl, path: args.path }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/lib/render/storage.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the integration verification script**

`scripts/verify-storage.mjs`:

```js
// Run: node -r dotenv/config scripts/verify-storage.mjs dotenv_config_path=.env.local
import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})
const path = `decks/_verify/${Date.now()}.txt`
const body = Buffer.from('hello-' + Date.now())
const up = await sb.storage.from('documents').upload(path, body, { contentType: 'text/plain', upsert: true })
if (up.error) { console.error('UPLOAD FAIL', up.error.message); process.exit(1) }
const sign = await sb.storage.from('documents').createSignedUrl(path, 600)
if (sign.error || !sign.data?.signedUrl) { console.error('SIGN FAIL', sign.error?.message); process.exit(1) }
const got = await fetch(sign.data.signedUrl).then(r => r.text())
if (got !== body.toString()) { console.error('ROUNDTRIP MISMATCH', got); process.exit(1) }
await sb.storage.from('documents').remove([path])
console.log('OK: upload + signed URL round-trip')
```

Run: `node -r dotenv/config scripts/verify-storage.mjs dotenv_config_path=.env.local`
Expected: `OK: upload + signed URL round-trip`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/render/storage.ts src/lib/render/storage.test.ts scripts/verify-storage.mjs
git commit -m "feat(render): storage upload + signed URL helper (throws, no swallow)"
```

---

## Task 5: Rewire `/api/export-pptx` to return a signed URL

**Files:**
- Modify: `src/app/api/export-pptx/route.ts:110-126` (the generate + response block)

**Interfaces:**
- Consumes: `uploadAndSignedUrl`, `deckArtifactPath` from `@/lib/render/storage`.
- Produces: `POST /api/export-pptx` returns JSON `{ success: true, pptxUrl, fileName, sizeBytes }` (was: raw `.pptx` buffer).

- [ ] **Step 1: Add the import**

At the top of `src/app/api/export-pptx/route.ts`, after the existing imports, add:

```ts
import { uploadAndSignedUrl, deckArtifactPath } from '@/lib/render/storage'
```

- [ ] **Step 2: Replace the buffer response (lines ~113-126)**

Replace this block:

```ts
    // Generate PPTX (renders HTML→PNG then builds slides with text overlays)
    const buffer = await generatePptx(documentData, htmlSlides)

    console.log(`[${requestId}] PPTX generated: ${buffer.length} bytes`)

    // Return as downloadable file
    const filename = encodeURIComponent(`${brandName}.pptx`)
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length.toString(),
      },
    })
```

with:

```ts
    // Generate PPTX (renders HTML→PNG then builds slides with text overlays)
    const buffer = await generatePptx(documentData, htmlSlides)
    console.log(`[${requestId}] PPTX generated: ${buffer.length} bytes`)

    // Upload to Storage + return a signed URL — never stream a large buffer
    // through the serverless response (Vercel ~4.5MB cap caused silent 413s).
    const fileName = `${brandName}.pptx`
    const { signedUrl } = await uploadAndSignedUrl({
      path: deckArtifactPath(documentId, 'pptx'),
      body: buffer,
      contentType:
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    })
    console.log(`[${requestId}] PPTX uploaded, signed URL issued`)

    return NextResponse.json({
      success: true,
      pptxUrl: signedUrl,
      fileName,
      sizeBytes: buffer.length,
    })
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors in `export-pptx/route.ts`.

- [ ] **Step 4: Manual integration check**

With `npm run dev` running, Gotenberg up, and a known generated `documentId`:

Run:
```bash
curl -s -X POST http://localhost:3000/api/export-pptx \
  -H 'content-type: application/json' \
  -d '{"documentId":"<DOC_ID>"}' | head -c 400
```
Expected: JSON containing `"pptxUrl":"https://...supabase.co/storage/v1/object/sign/documents/decks/<DOC_ID>/...pptx..."` and `"success":true`. Opening `pptxUrl` downloads a `.pptx` that opens in PowerPoint.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/export-pptx/route.ts
git commit -m "fix(export-pptx): upload to storage + return signed URL (kills 413 buffer failures)"
```

---

## Task 6: Rewire `/api/pdf` — Gotenberg render, signed URLs, no swallow

**Files:**
- Modify: `src/app/api/pdf/route.ts` (imports; HTML-native path lines ~52-87; AST path lines ~89-148; legacy path lines ~274-320)

**Interfaces:**
- Consumes: `htmlSlidesToPdf` from `@/lib/render/gotenberg`; `uploadAndSignedUrl`, `deckArtifactPath` from `@/lib/render/storage`; existing `presentationToHtmlSlides`.
- Produces: `POST /api/pdf` always returns JSON `{ success: true, pdfUrl, fileName, sizeBytes }`; no `action==='download'` buffer branch remains.

- [ ] **Step 1: Update imports**

In `src/app/api/pdf/route.ts`, replace the playwright import line:

```ts
import { generateMultiPagePdf, generateReactPdf, generateScreenshotPdf } from '@/lib/playwright/pdf'
```

with:

```ts
import { htmlSlidesToPdf } from '@/lib/render/gotenberg'
import { uploadAndSignedUrl, deckArtifactPath } from '@/lib/render/storage'
```

(Leave `presentationToHtmlSlides` and the template imports as-is — still used to build HTML.)

- [ ] **Step 2: Replace the HTML-native path (lines ~53-87)**

Replace the whole `if (htmlPres?.htmlSlides?.length) { ... }` block with:

```ts
    if (htmlPres?.htmlSlides?.length) {
      console.log(`[PDF] HTML-Native: ${htmlPres.htmlSlides.length} slides via Gotenberg`)
      const brandNameStr = (htmlPres.brandName || (documentData.brandName as string)) || ''

      const pdfBuffer = await htmlSlidesToPdf(htmlPres.htmlSlides, {
        title: htmlPres.title || brandNameStr || 'Presentation',
        brandName: brandNameStr,
      })
      console.log(`[PDF] PDF rendered: ${(pdfBuffer.length / 1024 / 1024).toFixed(1)} MB`)

      const fileName = `proposal_${document.id}.pdf`
      const { signedUrl } = await uploadAndSignedUrl({
        path: deckArtifactPath(documentId, 'pdf'),
        body: pdfBuffer,
        contentType: 'application/pdf',
      })
      await supabase.from('documents').update({ pdf_url: signedUrl, status: 'generated' }).eq('id', documentId)

      return NextResponse.json({ success: true, pdfUrl: signedUrl, fileName, sizeBytes: pdfBuffer.length })
    }
```

- [ ] **Step 3: Replace the AST path (lines ~89-149)**

Replace the whole `const astPresentation = ...` block (through its closing `}` and the `// ─── END AST path ───` comment) with:

```ts
    // ─── AST Presentation path ─────────────────
    const astPresentation = documentData._presentation as Presentation | undefined
    if (astPresentation && astPresentation.slides?.length > 0) {
      console.log(`[PDF] AST presentation: ${astPresentation.slides.length} slides via Gotenberg`)
      const brandNameStr = (documentData.brandName as string) || ''

      const astHtmlPages = presentationToHtmlSlides(astPresentation, true)
      const pdfBuffer = await htmlSlidesToPdf(astHtmlPages, {
        title: astPresentation.title || brandNameStr || 'Presentation',
        brandName: brandNameStr,
      })

      const fileName = `proposal_${document.id}.pdf`
      const { signedUrl } = await uploadAndSignedUrl({
        path: deckArtifactPath(documentId, 'pdf'),
        body: pdfBuffer,
        contentType: 'application/pdf',
      })
      await supabase.from('documents').update({ pdf_url: signedUrl, status: 'generated' }).eq('id', documentId)

      return NextResponse.json({ success: true, pdfUrl: signedUrl, fileName, sizeBytes: pdfBuffer.length })
    }
    // ─── END AST path ──────────────────────────────────────
```

- [ ] **Step 4: Replace the legacy render+response (lines ~262-320)**

Replace from `console.log(\`[PDF] Rendering ${htmlPages.length} slides...\`)` through the final `return NextResponse.json({ success: true, pdfUrl: ... })` (the legacy `generateMultiPagePdf` + upload + `action==='download'` block) with:

```ts
    console.log(`[PDF] Legacy template: ${htmlPages.length} slides via Gotenberg`)
    const legacyBrandName = (documentData.brandName as string) || ''
    const pdfBuffer = await htmlSlidesToPdf(htmlPages, {
      title: legacyBrandName || 'Proposal',
      brandName: legacyBrandName,
    })

    const fileName = `proposal_${document.id}.pdf`
    const { signedUrl } = await uploadAndSignedUrl({
      path: deckArtifactPath(documentId, 'pdf'),
      body: pdfBuffer,
      contentType: 'application/pdf',
    })
    await supabase
      .from('documents')
      .update({ pdf_url: signedUrl, status: 'generated', data: { ...documentData, _generatedImages: images } })
      .eq('id', documentId)

    return NextResponse.json({
      success: true,
      pdfUrl: signedUrl,
      fileName,
      sizeBytes: pdfBuffer.length,
      generatedImages: Object.keys(images).length,
    })
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors. (`generateMultiPagePdf`/`generateReactPdf`/`generateScreenshotPdf` are no longer referenced in this file; they remain exported from `@/lib/playwright/pdf` for any other callers.)

- [ ] **Step 6: Manual integration check**

Run:
```bash
curl -s -X POST http://localhost:3000/api/pdf \
  -H 'content-type: application/json' \
  -d '{"documentId":"<DOC_ID>"}' | head -c 400
```
Expected: JSON with `"pdfUrl":"https://...storage/v1/object/sign/documents/decks/<DOC_ID>/...pdf..."`. Opening it shows the slides with gradients/glass intact (screenshot fidelity).

- [ ] **Step 7: Commit**

```bash
git add src/app/api/pdf/route.ts
git commit -m "fix(pdf): render via Gotenberg, always return signed URL, drop direct-buffer/swallow paths"
```

---

## Task 7: Client download handlers — URL-based, specific errors, abort timeout

**Files:**
- Modify: `src/app/preview/[id]/page.tsx` (the `downloadPdf` handler ~76-107, and the PPTX download handler)

**Interfaces:**
- Consumes: `/api/pdf` and `/api/export-pptx` JSON responses `{ pdfUrl | pptxUrl, fileName }`.
- Produces: a shared `triggerDownload(url, fileName)` + per-format handlers that show specific errors.

- [ ] **Step 1: Add a shared download helper + timeout near the top of the component**

Add this helper inside the component file (module scope, above the component):

```ts
async function requestArtifact(
  endpoint: string,
  documentId: string,
): Promise<{ url: string; fileName: string }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 180_000) // 3 min
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ documentId }),
      signal: controller.signal,
    })
    const text = await res.text()
    let json: Record<string, unknown> = {}
    try { json = JSON.parse(text) } catch { /* non-JSON error body */ }
    if (!res.ok) {
      const detail = (json.error as string) || text.slice(0, 200) || `HTTP ${res.status}`
      throw new Error(`${res.status}: ${detail}`)
    }
    const url = (json.pdfUrl || json.pptxUrl) as string | undefined
    const fileName = (json.fileName as string) || 'download'
    if (!url) throw new Error('no download URL returned')
    return { url, fileName }
  } finally {
    clearTimeout(timeout)
  }
}

function triggerDownload(url: string, fileName: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.target = '_blank'
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}
```

- [ ] **Step 2: Replace the `downloadPdf` handler body**

Replace the existing `downloadPdf` function body with:

```ts
  const downloadPdf = async () => {
    setIsGenerating(true)
    try {
      const { url, fileName } = await requestArtifact('/api/pdf', document.id)
      triggerDownload(url, fileName)
    } catch (error) {
      console.error('Error downloading PDF:', error)
      alert(`שגיאה ביצירת ה-PDF\n${error instanceof Error ? error.message : ''}`)
    } finally {
      setIsGenerating(false)
    }
  }
```

- [ ] **Step 3: Replace (or add) the PPTX handler**

Ensure a `downloadPptx` handler exists with this body:

```ts
  const downloadPptx = async () => {
    setIsGenerating(true)
    try {
      const { url, fileName } = await requestArtifact('/api/export-pptx', document.id)
      triggerDownload(url, fileName)
    } catch (error) {
      console.error('Error downloading PPTX:', error)
      alert(`שגיאה ביצירת ה-PowerPoint\n${error instanceof Error ? error.message : ''}`)
    } finally {
      setIsGenerating(false)
    }
  }
```

Wire the PPTX button's `onClick` to `downloadPptx` if it isn't already.

- [ ] **Step 4: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no new errors in `preview/[id]/page.tsx`.

- [ ] **Step 5: Manual end-to-end check**

With dev server + Gotenberg running, open `/preview/<DOC_ID>`, click Download PDF and Download PPTX.
Expected: both files download and open correctly; if you stop Gotenberg, the PDF button shows a specific error (e.g. `500: Gotenberg screenshot failed ...`) rather than a generic message.

- [ ] **Step 6: Commit**

```bash
git add src/app/preview/[id]/page.tsx
git commit -m "fix(preview): URL-based downloads with specific errors + abort timeout"
```

---

## Self-Review

**Spec coverage (Phase 1 of the design spec §4.4 + §7 Phase 1):**
- "Move Chromium rendering out of serverless" → Tasks 2–3 (Gotenberg). ✓
- "Always upload to Storage + return signed URL; no direct buffers" → Tasks 4–6. ✓
- "Stop swallowing upload errors; surface specific errors" → Task 4 (throws), Task 6 (no swallow), Task 7 (client surfaces). ✓
- "Fix download failures with no engine change" → content/HTML slides untouched; only render+download changed. ✓
- Fonts (Hebrew RTL) bundled in the render container → Task 2 Dockerfile. ✓
- Screenshot fidelity preserved (not regressed to page.pdf flattening) → Task 3 uses Gotenberg screenshot endpoint + pdf-lib, mirroring the prior approach. ✓

**Deferred to later phases (not in this plan, by design):** async `@upstash/workflow` `deck_jobs` queue (rendering is fast enough to run synchronously within the routes' existing `maxDuration=600`; the queue matters most for the minutes-long AI *generation* step handled in a later phase); the canonical IR; the editable-PPTX renderer; consolidation. Noted so coverage gaps here are intentional, not omissions.

**Placeholder scan:** none — every code step contains complete code; every run step has an exact command + expected output.

**Type consistency:** `htmlToPng`/`pngsToPdf`/`htmlSlidesToPdf` signatures in Task 3 match their use in Task 6. `uploadAndSignedUrl`/`deckArtifactPath` signatures in Task 4 match their use in Tasks 5–6. Response shape `{ pdfUrl | pptxUrl, fileName, sizeBytes }` produced in Tasks 5–6 matches `requestArtifact`'s consumption in Task 7.

**Known follow-ups (track, don't fix here):** the `documents` bucket is currently read via `getPublicUrl` elsewhere; signed URLs work regardless of public/private, but if the bucket is later made private, audit any remaining `getPublicUrl` callers. The `pdf_url` column now stores a *signed* (expiring) URL — if any consumer persists/emails it long-term, regenerate on demand instead of trusting the stored value.
