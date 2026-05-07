/**
 * "Research is ready" email — sent direct via Gmail API using one of the
 * leaders-platform users' OAuth refresh tokens (no Make.com needed).
 *
 * Sender priority:
 *   1. The job's owner if they have a refresh token in user_google_tokens.
 *   2. Most recently refreshed token in the table (dev-mode jobs whose
 *      user_id doesn't map to a real auth user).
 *
 * The recipient is whatever was captured into research_jobs.notify_email.
 */

import { sendGmailEmail } from "@/lib/gmail";
import { createSupabaseService } from "./service";

type EmailParams = {
  jobUserId: string;
  toEmail: string;
  topic: string;
  title: string;
  subtitle?: string;
  executiveSummary?: string;
  reportUrl: string;
  jobUrl: string;
  pdfUrl?: string | null;
};

export async function sendResearchDoneEmail(p: EmailParams): Promise<{ messageId: string; from: string }> {
  const sb = createSupabaseService();

  // Try the owner's refresh token first
  const { data: ownerToken } = await sb
    .from("user_google_tokens")
    .select("refresh_token, user_id")
    .eq("user_id", p.jobUserId)
    .maybeSingle();

  let token = ownerToken;
  if (!token) {
    const { data: anyToken } = await sb
      .from("user_google_tokens")
      .select("refresh_token, user_id")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    token = anyToken;
  }

  if (!token) {
    throw new Error(
      "no Google refresh token in user_google_tokens — no Leaders user has logged in yet",
    );
  }

  // Sender identity = the user whose token we're borrowing. The email shows
  // up in their Sent folder; receivers see "From: <their address>".
  const { data: senderUser } = await sb
    .from("users")
    .select("email, full_name")
    .eq("id", token.user_id)
    .single();

  const senderEmail = (senderUser?.email as string) ?? "noreply@ldrsgroup.com";
  const senderName = "Leaders Research";

  const html = buildHtml(p);
  const subject = `הדוח "${p.title}" מוכן`;

  const res = await sendGmailEmail({
    refreshToken: token.refresh_token as string,
    from: senderEmail,
    fromName: senderName,
    to: p.toEmail,
    subject,
    html,
  });

  return { messageId: res.messageId, from: senderEmail };
}

function buildHtml(p: EmailParams): string {
  const safe = (s?: string | null) =>
    (s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] || c));

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safe(p.title)}</title>
  <style>
    body { margin: 0; padding: 0; background: #fcfaf7; font-family: -apple-system, BlinkMacSystemFont, "Heebo", "Segoe UI", sans-serif; color: #1a1a2e; }
    .wrap { max-width: 600px; margin: 0 auto; padding: 40px 24px; }
    .badge { display: inline-block; font-size: 11px; letter-spacing: 0.4em; text-transform: uppercase; color: #c9a227; font-weight: 500; margin-bottom: 16px; }
    h1 { font-family: "Cormorant Garamond", "Times New Roman", serif; font-style: italic; font-size: 36px; line-height: 1.1; margin: 0 0 12px 0; color: #1a1a2e; font-weight: 500; }
    .subtitle { font-size: 17px; line-height: 1.5; color: #16213e; margin: 0 0 24px 0; }
    .topic-line { font-size: 12px; letter-spacing: 0.2em; text-transform: uppercase; color: #6c6c76; margin-bottom: 32px; }
    .summary { background: #ffffff; border: 1px solid #e6e4e0; border-radius: 16px; padding: 24px; margin: 24px 0; line-height: 1.75; font-size: 15px; }
    .summary p:first-child { margin-top: 0; }
    .summary p:last-child { margin-bottom: 0; }
    .cta { display: inline-block; background: #1a1a2e; color: #ffffff !important; padding: 14px 32px; border-radius: 999px; text-decoration: none; font-weight: 500; font-size: 15px; margin-top: 16px; }
    .cta-secondary { display: inline-block; color: #16213e !important; padding: 14px 24px; text-decoration: none; font-weight: 500; font-size: 14px; margin-top: 16px; margin-right: 8px; }
    .footer { margin-top: 48px; padding-top: 24px; border-top: 1px dashed #e6e4e0; font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase; color: #9b9994; text-align: center; }
    a.report-link { color: #e94560; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="badge">Leaders Research · הדוח מוכן</div>
    <h1>${safe(p.title)}</h1>
    ${p.subtitle ? `<p class="subtitle">${safe(p.subtitle)}</p>` : ""}
    <div class="topic-line">נושא: ${safe(p.topic)}</div>

    ${
      p.executiveSummary
        ? `<div class="summary">${safe(p.executiveSummary).split("\n\n").map((para) => `<p>${para.replace(/\n/g, "<br>")}</p>`).join("")}</div>`
        : ""
    }

    <div>
      <a href="${p.reportUrl}" class="cta">פתח דוח מלא</a>
      ${p.pdfUrl ? `<a href="${p.pdfUrl}" class="cta-secondary">הורד PDF</a>` : ""}
    </div>

    <p style="margin-top: 24px; font-size: 13px; color: #6c6c76;">
      קישור לעמוד ה-job עם כל ההיסטוריה והאפשרות להריץ מחקר משופר:<br>
      <a href="${p.jobUrl}" class="report-link">${p.jobUrl}</a>
    </p>

    <div class="footer">Leaders Research · Internal Use Only</div>
  </div>
</body>
</html>`;
}
