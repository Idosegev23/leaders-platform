# RESUME — Presentation Engine Re-Architecture

> **Read this first if you're resuming this work in a new session.**
> Last updated: 2026-06-30. This is an untracked working-tree file (visible on any branch).

---

## ⚠️ WHERE THE WORK IS (read carefully)

All of this work lives on a **separate git branch**, NOT the currently-checked-out one.

```bash
git checkout presentation-engine-rearchitecture   # ← the work is here (tip: 9cc4159)
```

- **Work branch:** `presentation-engine-rearchitecture` — has the design spec, the Phase 1 plan, and all 9 Phase-1 commits.
- The repo was last seen checked out on `feat/leaders-feedback-5-features` (unrelated 5-features work). On that branch the Phase 1 files do **not** exist and `src/app/preview/[id]/page.tsx` shows its OLD pre-Phase-1 version (old `downloadPdf` with `action:'download'` + blob, a `CanvaDeckButton`, and no PPTX button). That's expected — switch to the work branch to see Phase 1.

**Nothing is lost.** Verify with: `git log presentation-engine-rearchitecture --oneline -10`.

---

## THE GOAL (what we're building & why)

The AI presentation/deck generator (`/create-proposal` → research → wizard → generate → edit → preview → download, forked from pptmaker) has two problems the user wants fixed **end-to-end, at the highest quality**:
1. **Downloads fail** (PDF/PPTX) — confirmed root causes: PPTX returned as a raw buffer (Vercel ~4.5MB cap → silent 413); Chromium (`@sparticuz/chromium`) run inside the serverless function (cold-start/binary → 500); Supabase upload errors swallowed → dead URLs → 404; generic client errors.
2. **PPTX is not editable** — it's HTML→PNG embedded as an image; not a word can be edited.

### Decisions locked with the user (via brainstorming)
- **Full re-architecture**, highest quality (not a patch).
- Output = **both**: pixel-perfect **PDF** (view-only) **and** **editable PPTX**.
- **"Creativity always."** The canonical representation is a **rich free-form IR** (any element, any position, any style — like today, but stored as structured data, NOT a throwaway HTML string). The AI keeps breaking templates. PDF is always perfect; PPTX exports as native editable objects for everything PowerPoint supports and rasterizes only browser-only-effect elements to faithful images — automatically, per element. No template rigidity.
- **Build on existing code**: the repo already has THREE half-built structured systems (`src/types/presentation.ts` AST; `src/lib/slide-engine/*` semantic tokens; `src/lib/gemini/layout-prototypes/*` `StructuredPresentation`). Consolidate into ONE canonical IR (base it on the rich absolute-positioned AST in `presentation.ts`).
- **Tech verdict:** adopt **Gotenberg** (Docker, Chromium+LibreOffice, MIT) for rendering; **pptxgenjs** (already a dep) for editable PPTX; reuse **`@upstash/workflow`** (already proven in `research-hub`) for async jobs. Keep the in-house AI engine (Gemini→Claude via `callAI`) — external tools (Gamma/Presenton) regress Hebrew RTL + brand control. Rejected: LibreOffice PPTX→PDF single-source (RTL fidelity risk).

### The two design docs (on the work branch)
- Spec: `docs/superpowers/specs/2026-06-30-presentation-engine-rearchitecture-design.md`
- Phase 1 plan: `docs/superpowers/plans/2026-06-30-phase1-reliable-rendering-downloads.md`

---

## PHASE 1 — DONE & COMMITTED (reliable rendering & downloads)

Built task-by-task via a verified workflow. Commits on `presentation-engine-rearchitecture`:

| Commit | What |
|---|---|
| `801852c` | vitest test runner (`vitest.config.ts`, `npm test`) |
| `75e49f6` | Gotenberg service: `docker/gotenberg/Dockerfile` (Gotenberg 8 + Heebo font), `docker-compose.yml`, `scripts/verify-gotenberg.mjs` |
| `3d203a4` | `src/lib/render/gotenberg.ts` — `htmlToPng` (screenshot endpoint, keeps gradient/glass fidelity), `pngsToPdf`, `htmlSlidesToPdf` + unit test |
| `347e71f` | `src/lib/render/storage.ts` — `uploadAndSignedUrl` (**throws**, no swallow) + `deckArtifactPath` + `scripts/verify-storage.mjs` |
| `1fe7d11` | `/api/export-pptx` → upload to storage + return signed URL (kills the 413 buffer failure) |
| `d972c98` | `/api/pdf` → render via Gotenberg, always return signed URL, removed direct-buffer/`action:download` + swallowed-error paths |
| `f6027d3` | `src/app/preview/[id]/page.tsx` — URL-based downloads, specific errors, 3-min abort timeout (`requestArtifact`, `triggerDownload`, `downloadPptx`) |
| `e43781a` | Added the missing **PPTX download button** in preview (was defined-but-unwired) |

### What is actually VERIFIED (not just written)
- ✅ **Supabase storage round-trip** against the real project (`documents` bucket exists; upload + `createSignedUrl` + fetch works). Ran: `node -r dotenv/config scripts/verify-storage.mjs dotenv_config_path=.env.local` → `OK`.
- ✅ **Gotenberg client contract** against a mock server: `htmlToPng` POSTs to `/forms/chromium/screenshot/html` with correct multipart fields (`files`/`index.html`, `width=1920`, `height=1080`, `format=png`) and returns bytes; `htmlSlidesToPdf` assembles a valid 2-page 1920×1080 PDF. (Throwaway mock test, not committed.)
- ✅ `npx tsc --noEmit` clean; `npm test` 2/2 pass; import chain resolves; both routes return `{ url, fileName, sizeBytes }`; client reads it; **no direct-buffer response and no swallowed upload error remain**.

### What is NOT yet verified (needs a running Gotenberg — no Docker in the build env)
- ❌ The **actual Chromium render quality** inside Gotenberg (Heebo/Hebrew RTL, gradients, glass). Only a live Gotenberg can confirm this.

---

## IMMEDIATE NEXT STEPS

### A. Stand up Gotenberg (the one open infra decision — §10 of the spec)
Gotenberg only ships as a Docker image; it must run **on a server, not the user's laptop**. The user was (rightly) worried their computer isn't a server — clarified: in production Gotenberg runs on a cloud host and serves ALL users; the laptop is never in the chain. Recommended: **Railway/Render/Fly one-click** (they run the Docker image for you; no local Docker needed).
1. Deploy Gotenberg (use `docker/gotenberg/Dockerfile` for the Heebo font, or a stock `gotenberg/gotenberg:8` + a font volume).
2. Set `GOTENBERG_URL` to the deployed URL in **all three Vercel environments** (use `printf %s`, not `echo`, when piping into `vercel env add`).
3. (Local, optional, needs Docker Desktop) `cd docker/gotenberg && docker compose up -d --build` then:
   - `curl -s http://localhost:3001/health` → `{"status":"up"}`
   - `node scripts/verify-gotenberg.mjs` → `OK: ... PNG`
   - `npm run dev` → open `/preview/<DOC_ID>` → click **הורד PDF** + **הורד PowerPoint**.

### B. Then Phase 2 (not yet planned) — the canonical IR
This is the heart of "editable PPTX + creativity always." Write a `docs/superpowers/plans/…phase2…md` for: lock/extend the `presentation.ts` AST as the single IR (Zod + version-stamp), make the AI (`callAI`, `responseSchema`) emit the IR (archetypes from `layout-prototypes` as starting points; few-shot bank + `vision-inspector`/`lite-validation` for quality), and a complete AST→HTML renderer for the Gotenberg PDF path. Phases 3–5 after: IR→pptxgenjs editable renderer (graceful per-element degradation), wire edit/single-slide-regen to the IR, consolidate the 3 legacy structured systems + retire raw-HTML `slide-designer.ts`.

---

## MERGE / STATE CAVEATS
- The work branch's `preview/[id]/page.tsx` (Phase 1 version) was edited from an earlier base. The feature branch's current version has a `CanvaDeckButton` (line ~157) — reconcile on merge so both the Canva button and the new PDF/PPTX URL-based handlers coexist.
- `pdf_url` now stores a **signed (expiring, 7-day) URL**. If anything emails/persists it long-term, regenerate on demand instead of trusting the stored value.
- Phase 1 kept slide *content* untouched — only render + download plumbing changed. Old decks (`_htmlPresentation.htmlSlides[]`) still work; their PPTX stays image-based until Phase 4.
- Environment note: the build/verify environment has **no Docker** and Bash is sandboxed (network needs sandbox-disable). Node v20.15.0. `.env.local` has Supabase URL + service-role key.

## Handy commands
```bash
git checkout presentation-engine-rearchitecture     # get back to the work
git log --oneline -10                                # confirm the 9 Phase-1 commits
npm test                                             # 2/2 unit tests
npx tsc --noEmit                                     # clean
```
