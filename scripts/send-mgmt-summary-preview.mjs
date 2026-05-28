/**
 * One-off: render the new AI-summary mgmt email for Hadar's brief and send it
 * to a single test recipient so we can eyeball the design before turning it on.
 * Sends FROM Roei's mailbox (he's the original brief sender for this link
 * and has a verified refresh_token).
 *
 * NB: keep the inlined HTML in sync with buildMgmtBriefCompletedHtml +
 * renderSummaryBlock in src/app/api/links/[token]/route.ts.
 */

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i), l.slice(i + 1)]
    }),
)
for (const [k, v] of Object.entries(env)) process.env[k] ??= v

const TO = process.env.PREVIEW_TO || 'ido@triroars.co.il'
const SENDER_EMAIL = 'roei@ldrsgroup.com'
const BRIEF_TOKEN = '83bf11ce-30b2-4579-9d63-23b5657f5f55'

const { summariseBriefForMgmt } = await import('../src/lib/brief/ai-summary.ts')
const { sendGmailEmail } = await import('../src/lib/gmail.ts')

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// 1. Pull the link + submission_data.
const { data: link } = await sb
  .from('document_links')
  .select('client_name, client_email, created_by_name, metadata')
  .eq('token', BRIEF_TOKEN)
  .single()
const submission = link.metadata.submission_data
const briefDocLink = link.metadata.brief_drive_doc_link || null
const language = link.metadata.language || 'he'

// 2. Resolve Roei's refresh_token.
const { data: u } = await sb.from('users').select('id').eq('email', SENDER_EMAIL).single()
const { data: tok } = await sb
  .from('user_google_tokens')
  .select('refresh_token')
  .eq('user_id', u.id)
  .single()
if (!tok?.refresh_token) {
  console.error('No refresh_token for sender', SENDER_EMAIL)
  process.exit(1)
}

// 3. AI summary.
console.log('Generating AI summary…')
const t0 = Date.now()
const aiSummary = await summariseBriefForMgmt(submission, language)
console.log(`Summary in ${Date.now() - t0}ms — bullets=${aiSummary?.bullets.length ?? 0} attention=${aiSummary?.attention.length ?? 0}`)
if (aiSummary) {
  console.log('headline:', aiSummary.headline)
  console.log('attention:', JSON.stringify(aiSummary.attention))
}

// 4. Build HTML (inlined — same logic as src/app/api/links/[token]/route.ts).
const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function renderSummaryBlock(s) {
  if (!s) return ''
  const headlineHtml = s.headline
    ? `<p dir="rtl" style="font-size:16px;font-weight:600;line-height:1.55;margin:0 0 16px;color:#1a1a2e;text-align:right;">${escapeHtml(s.headline)}</p>`
    : ''
  const bulletsHtml = s.bullets.length === 0
    ? ''
    : s.bullets
        .map(
          (b) => `<div dir="rtl" style="margin:0 0 12px;text-align:right;">
            <div style="font-size:12px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px;">${escapeHtml(b.label)}</div>
            <div style="font-size:14px;line-height:1.6;color:#1a1a2e;">${escapeHtml(b.value)}</div>
          </div>`,
        )
        .join('')
  return `<div dir="rtl" style="background:#f9f7f2;border:1px solid #e8e5dc;border-radius:8px;padding:20px 22px;margin:0 0 18px;text-align:right;direction:rtl;">${headlineHtml}${bulletsHtml}</div>`
}

const attentionBlock = aiSummary && aiSummary.attention.length > 0
  ? `<div dir="rtl" style="background:#fef2f2;border-right:3px solid #dc2626;padding:14px 16px;border-radius:6px;margin:0 0 18px;font-size:14px;line-height:1.7;color:#1a1a2e;text-align:right;">
      <strong style="display:block;margin-bottom:6px;color:#991b1b;">לתשומת לב</strong>
      <ul style="margin:0;padding:0;list-style-position:inside;">
        ${aiSummary.attention.map((a) => `<li style="margin-bottom:4px;">${escapeHtml(a)}</li>`).join('')}
      </ul>
    </div>`
  : ''

const html = `<!DOCTYPE html><html dir="rtl" lang="he"><body dir="rtl" style="font-family:'Heebo',Arial,sans-serif;background:#f5f3ef;color:#1a1a2e;margin:0;padding:32px;direction:rtl;text-align:right;">
    <div dir="rtl" style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e8e5dc;border-radius:8px;padding:32px;direction:rtl;text-align:right;">
      <p dir="rtl" style="font-size:11px;letter-spacing:.4em;text-transform:uppercase;color:#888;margin:0 0 16px;text-align:right;direction:ltr;unicode-bidi:plaintext;">Leaders × OS</p>
      <h1 dir="rtl" style="font-size:22px;font-weight:700;margin:0 0 10px;line-height:1.3;text-align:right;">בריף התקבל — ${escapeHtml(link.client_name)}</h1>
      <p dir="rtl" style="font-size:14px;line-height:1.6;margin:0 0 22px;color:#555;text-align:right;">${link.client_email ? `<span dir="ltr">${escapeHtml(link.client_email)}</span> · ` : ''}${link.created_by_name ? `הופנה ע״י ${escapeHtml(link.created_by_name)}` : ''}</p>
      ${renderSummaryBlock(aiSummary)}
      ${attentionBlock}
      ${briefDocLink ? `<p dir="rtl" style="margin:22px 0 8px;text-align:right;"><a href="${briefDocLink}" style="background:#1a1a2e;color:#fff;text-decoration:none;padding:11px 24px;border-radius:9999px;font-weight:600;display:inline-block;font-size:14px;">פתח את הבריף המלא ב-Google Doc ↗</a></p>` : ''}
      <p dir="rtl" style="font-size:12px;color:#888;line-height:1.6;margin:20px 0 0;border-top:1px solid #e8e5dc;padding-top:14px;text-align:right;">הצעד הבא: לקרוא את הבריף ב-Drive. אם הוא תקין — להעביר את התיקייה ל-"נסגר" ידנית. זה פותח workspace ללקוח ומאפשר טופס התנעה.</p>
    </div></body></html>`

// 5. Send.
console.log(`Sending preview to ${TO} from ${SENDER_EMAIL}…`)
const result = await sendGmailEmail({
  refreshToken: tok.refresh_token,
  from: SENDER_EMAIL,
  fromName: 'Leaders × OS (preview)',
  to: TO,
  subject: `[Preview] ✅ בריף התקבל מ-${link.client_name}`,
  html,
})
console.log('Sent. messageId =', result.messageId)
