/**
 * HTML emails for the signature flow.
 * Plain inline-styled tables — survive every email client + dark mode.
 */

const BRAND_BG = '#1a1a2e'
const ACCENT = '#e94560'
const GOLD = '#c9a227'
const TEXT = '#ffffff'

export function buildSignatureRequestEmail(params: {
  recipientName: string | null
  senderName: string
  title: string
  signLink: string
  message?: string | null
}): string {
  const greeting = params.recipientName ? `שלום ${params.recipientName},` : 'שלום,'
  const messageBlock = params.message
    ? `<tr><td style="padding:0 40px 28px"><div style="font-size:14px;color:#1a1a2e;line-height:1.8;border-inline-start:3px solid ${GOLD};padding-inline-start:14px;background:#fbf5e6;padding:14px 18px;border-radius:6px">${escape(params.message)}</div></td></tr>`
    : ''

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f0f0f8;font-family:Arial,Helvetica,sans-serif;direction:rtl;color:#1a1a2e;line-height:1.7">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0f0f8;padding:40px 20px"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(26,26,46,0.08)">
<tr><td style="padding:40px 40px 8px">
<div style="font-size:11px;letter-spacing:0.4em;text-transform:uppercase;color:rgba(26,26,46,0.45);font-weight:600">Leaders × OS</div>
</td></tr>
<tr><td style="padding:8px 40px 24px">
<div style="font-size:26px;font-weight:bold;color:${BRAND_BG};line-height:1.2">${escape(params.title)}</div>
<div style="margin-top:6px;width:48px;height:2px;background:${ACCENT}"></div>
</td></tr>
<tr><td style="padding:0 40px 12px">
<div style="font-size:16px;color:#1a1a2e">${escape(greeting)}</div>
</td></tr>
<tr><td style="padding:0 40px 24px">
<div style="font-size:14px;color:rgba(26,26,46,0.75);line-height:1.8">${escape(params.senderName)} מ־Leaders שלח לך מסמך לחתימה. תוכל לצפות במסמך, לקרוא בעיון ולחתום בקליק אחד.</div>
</td></tr>
${messageBlock}
<tr><td align="center" style="padding:0 40px 36px">
<a href="${params.signLink}" target="_blank" style="display:inline-block;background:${BRAND_BG};color:${TEXT};text-decoration:none;font-size:15px;font-weight:600;padding:14px 44px;border-radius:999px;letter-spacing:0.04em">צפייה וחתימה ←</a>
</td></tr>
<tr><td style="background:${BRAND_BG};padding:22px 40px;text-align:center">
<div style="font-size:11px;color:rgba(255,255,255,0.55)">קישור פרטי — אל תעביר לאחרים. תוקף הקישור: 30 יום.</div>
</td></tr>
</table>
</td></tr></table>
</body></html>`
}

export function buildSignedConfirmationEmail(params: {
  signerName: string
  title: string
  driveLink: string
  signedAt: string
  isInternal?: boolean
}): string {
  const intro = params.isInternal
    ? `${escape(params.signerName)} חתם על המסמך.`
    : `שלום, צירפנו עותק חתום של "${escape(params.title)}" לידיעתך.`

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f0f0f8;font-family:Arial,Helvetica,sans-serif;direction:rtl;color:#1a1a2e">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0f0f8;padding:40px 20px"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(26,26,46,0.08)">
<tr><td style="padding:40px 40px 12px">
<div style="font-size:11px;letter-spacing:0.4em;text-transform:uppercase;color:rgba(26,26,46,0.45);font-weight:600">Leaders × OS · חתום</div>
</td></tr>
<tr><td style="padding:8px 40px 22px">
<div style="font-size:26px;font-weight:bold;color:${BRAND_BG};line-height:1.2">${escape(params.title)}</div>
<div style="margin-top:6px;width:48px;height:2px;background:${ACCENT}"></div>
</td></tr>
<tr><td style="padding:0 40px 18px">
<div style="font-size:14px;color:rgba(26,26,46,0.8);line-height:1.8">${intro}</div>
</td></tr>
<tr><td style="padding:0 40px 18px">
<table cellpadding="14" cellspacing="0" border="0" style="background:#fbf5e6;border-radius:8px;width:100%">
<tr><td>
<div style="font-size:11px;color:rgba(26,26,46,0.55);letter-spacing:0.16em;text-transform:uppercase">חתם</div>
<div style="font-size:15px;color:#1a1a2e;font-weight:600;margin-top:4px">${escape(params.signerName)}</div>
<div style="font-size:11px;color:rgba(26,26,46,0.55);letter-spacing:0.16em;text-transform:uppercase;margin-top:14px">בתאריך</div>
<div style="font-size:14px;color:#1a1a2e;margin-top:4px">${escape(params.signedAt)}</div>
</td></tr></table>
</td></tr>
<tr><td align="center" style="padding:6px 40px 36px">
<a href="${params.driveLink}" target="_blank" style="display:inline-block;background:${BRAND_BG};color:${TEXT};text-decoration:none;font-size:15px;font-weight:600;padding:13px 38px;border-radius:999px;letter-spacing:0.04em">צפה במסמך החתום ←</a>
</td></tr>
<tr><td style="background:${BRAND_BG};padding:22px 40px;text-align:center">
<div style="font-size:11px;color:rgba(255,255,255,0.5)">המסמך שמור גם בתיקיית Drive של הלקוח</div>
</td></tr>
</table>
</td></tr></table>
</body></html>`
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
