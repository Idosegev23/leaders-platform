import type { PriceQuoteSignature } from '@/types/price-quote'

const LOGO_PATH = '/new_logo.svg'

/** All commercial/legal terms are data-driven so they're CONFIGURABLE per contract. */
export interface InfluencerContractData {
  /** Header */
  clientName: string          // brand the influencer is engaged for
  campaignName: string
  date: string                // dd/mm/yyyy — issue date
  /** Influencer identity */
  influencerName: string
  influencerHandle: string    // @username
  influencerFollowers?: string // e.g. "120K"
  /** Commercial terms — CONFIGURABLE */
  deliverables: string[]      // e.g. ["2 סטוריז", "ריל 1"]
  engagementFee: string       // e.g. "5,000 ₪ + מע\"מ"
  paymentTerms: string        // CONFIGURABLE — e.g. "שוטף +30 מיום אישור התכנים"
  contentApprovalNote: string // CONFIGURABLE
  exclusivityNote: string     // CONFIGURABLE
  usageRightsNote: string     // CONFIGURABLE
  /** Boilerplate legal clauses — CONFIGURABLE list */
  legalClauses: string[]
  /** Signature (filled on the signed regeneration pass) */
  signature?: PriceQuoteSignature | null
}

/** CONFIGURABLE defaults — override any of these per contract at call time. */
export const INFLUENCER_CONTRACT_DEFAULTS = {
  paymentTerms:
    'התמורה תשולם בכפוף לאישור התכנים ולעמידה בלוחות הזמנים, בתנאי שוטף +30 מיום קבלת חשבונית.',
  contentApprovalNote:
    'כל תוכן יועבר לאישור מוקדם של Leaders והמותג טרם פרסומו. Leaders רשאית לבקש תיקונים סבירים.',
  exclusivityNote:
    'המשפיען/ית מתחייב/ת שלא לקדם מותג מתחרה ישיר בקטגוריה למשך 14 יום ממועד הפרסום האחרון בקמפיין.',
  usageRightsNote:
    'המותג ו-Leaders רשאים לעשות שימוש חוזר בתכני הקמפיין בערוצי המדיה שלהם למשך 12 חודשים.',
  legalClauses: [
    'ההתקשרות הינה בין המשפיען/ית לבין Leaders, ואינה יוצרת יחסי עובד–מעביד.',
    'המשפיען/ית אחראי/ת לתשלום כל מס החל עליו/ה בגין התמורה.',
    'סימון תוכן ממומן ייעשה בהתאם לדין (לרבות חוק הגנת הצרכן והנחיות הרשות).',
    'הפרה יסודית של ההסכם מזכה את Leaders בביטול ההתקשרות וקיזוז התמורה.',
    'על הסכם זה יחולו דיני מדינת ישראל; סמכות שיפוט ייחודית לבתי המשפט במחוז תל אביב.',
  ],
} as const

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function baseStyles(logoUrl: string): string {
  return `
    * { margin:0; padding:0; box-sizing:border-box; }
    @page { size: A4; margin: 0; }
    body {
      font-family: 'Heebo','Assistant',Arial,sans-serif;
      direction: rtl; color:#1a1a2e; background:#fff;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .page {
      width: 210mm; min-height: 297mm; padding: 22mm 20mm;
      position: relative; page-break-after: always;
    }
    .page:last-child { page-break-after: auto; }
    .brand { display:flex; align-items:center; justify-content:space-between; margin-bottom:18px; }
    .brand img { height: 34px; }
    .kicker { font-size:11px; letter-spacing:.32em; text-transform:uppercase; color:#c9a227; font-weight:700; }
    h1 { font-size:26px; color:#1a1a2e; margin:8px 0 2px; }
    .subhead { font-size:13px; color:rgba(26,26,46,.6); margin-bottom:20px; }
    .accent { width:52px; height:3px; background:#e94560; margin:6px 0 22px; }
    .parties { background:#f7f7fb; border:1px solid #ececf4; border-radius:10px; padding:16px 18px; margin-bottom:20px; font-size:13px; line-height:1.9; }
    .parties b { color:#1a1a2e; }
    h2 { font-size:15px; color:#1a1a2e; margin:22px 0 8px; border-inline-start:3px solid #e94560; padding-inline-start:10px; }
    ul { padding-inline-start:20px; }
    li { font-size:12.5px; line-height:1.9; color:rgba(26,26,46,.85); margin-bottom:2px; }
    p.term { font-size:12.5px; line-height:1.9; color:rgba(26,26,46,.85); margin-bottom:6px; }
    .fee { display:inline-block; background:#1a1a2e; color:#fff; font-weight:700; border-radius:999px; padding:6px 18px; font-size:14px; }
    .signature-fields { font-size:13px; line-height:2.6; margin-top:8px; }
    .signature-line { display:inline-block; border-bottom:1px solid #1a1a2e; min-width:120px; margin:0 6px; text-align:center; }
    .signature-line.filled { border-bottom:1px solid #1a1a2e; font-weight:600; }
    .signature-image { height:56px; vertical-align:middle; margin:0 6px; }
    .signature-typed { font-family:'Heebo',cursive; font-size:22px; margin:0 6px; }
    .foot { position:absolute; bottom:12mm; inset-inline:20mm; font-size:10px; color:rgba(26,26,46,.45); border-top:1px solid #ececf4; padding-top:8px; }
    .logo-src { display:none; }
  `.replace('.logo-src', `.logo-src[data-src="${logoUrl}"]`)
}

/** Identical shape to price-quote's signature block so the sign endpoint fills the same fields. */
function signatureBlockHtml(sig?: PriceQuoteSignature | null): string {
  const filled = (v?: string | null, w?: string) =>
    v
      ? `<span class="signature-line filled"${w ? ` style="min-width:${w};"` : ''}>${esc(v)}</span>`
      : `<span class="signature-line"${w ? ` style="min-width:${w};"` : ''}></span>`
  const sigImg = sig?.image_data_url
    ? `<img class="signature-image" src="${sig.image_data_url}" alt="signature" />`
    : sig?.typed_name
      ? `<span class="signature-typed">${esc(sig.typed_name)}</span>`
      : `<span class="signature-line" style="min-width:180px;"></span>`
  return `
    <div class="signature-fields">
      תאריך: ${filled(sig?.date)}
      שם מלא: ${filled(sig?.signer_name)}
      ת.ז: ${filled(sig?.id_number)}
      תפקיד: ${filled(sig?.signer_role)}
      <br>
      חתימה: ${sigImg}
      <br>
      שם עסק/חברה: ${filled(sig?.company_name, '180px')}
      ח.פ/ע.מ: ${filled(sig?.company_hp)}
    </div>`
}

export function generateInfluencerContractPages(
  data: InfluencerContractData,
  logoBaseUrl: string,
): string[] {
  const logoUrl = `${logoBaseUrl}${LOGO_PATH}`
  const clauses = data.legalClauses.length ? data.legalClauses : [...INFLUENCER_CONTRACT_DEFAULTS.legalClauses]
  const page = `
    <!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8">
    <style>${baseStyles(logoUrl)}</style></head>
    <body>
      <div class="page">
        <div class="brand">
          <span class="kicker">Leaders · הסכם משפיען/ית</span>
          <img src="${logoUrl}" alt="Leaders" />
        </div>
        <h1>${esc(data.campaignName || 'הסכם התקשרות משפיען/ית')}</h1>
        <div class="subhead">${esc(data.clientName)} · ${esc(data.date)}</div>
        <div class="accent"></div>

        <div class="parties">
          <div><b>המזמין:</b> Leaders בשם המותג ${esc(data.clientName)}</div>
          <div><b>המשפיען/ית:</b> ${esc(data.influencerName)} (${esc(data.influencerHandle)})${
            data.influencerFollowers ? ` · ${esc(data.influencerFollowers)} עוקבים` : ''
          }</div>
        </div>

        <h2>1. תוצרי הקמפיין (Deliverables)</h2>
        <ul>${(data.deliverables.length ? data.deliverables : ['—']).map((d) => `<li>${esc(d)}</li>`).join('')}</ul>

        <h2>2. תמורה ותנאי תשלום</h2>
        <p class="term"><span class="fee">${esc(data.engagementFee)}</span></p>
        <p class="term">${esc(data.paymentTerms)}</p>

        <h2>3. אישור תכנים</h2>
        <p class="term">${esc(data.contentApprovalNote)}</p>

        <h2>4. בלעדיות</h2>
        <p class="term">${esc(data.exclusivityNote)}</p>

        <h2>5. זכויות שימוש</h2>
        <p class="term">${esc(data.usageRightsNote)}</p>

        <h2>6. תנאים כלליים</h2>
        <ul>${clauses.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>

        <h2>7. חתימת המשפיען/ית</h2>
        ${signatureBlockHtml(data.signature)}

        <div class="foot">מסמך זה נוצר במערכת Leaders. קישור החתימה פרטי — אין להעבירו לצד ג׳.</div>
      </div>
    </body></html>`
  return [page]
}
