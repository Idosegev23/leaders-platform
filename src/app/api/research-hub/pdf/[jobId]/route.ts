import { NextResponse } from "next/server";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";
import { createSupabaseService } from "@/lib/research-hub/service";

export const runtime = "nodejs";
export const maxDuration = 600;

const BUCKET = "research-reports";

async function renderPdf(reportId: string, appUrl: string) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const url = `${appUrl}/research-hub/reports/${reportId}/pdf?key=${encodeURIComponent(key)}`;

  const executablePath = process.env.CHROMIUM_PACK_URL
    ? await chromium.executablePath(process.env.CHROMIUM_PACK_URL)
    : await chromium.executablePath();

  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath,
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 1800 });
    await page.goto(url, { waitUntil: "networkidle0", timeout: 120_000 });
    await page.evaluateHandle("document.fonts.ready");

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "16mm", bottom: "16mm", left: "14mm", right: "14mm" },
      displayHeaderFooter: true,
      headerTemplate: `<div></div>`,
      footerTemplate: `
        <div style="font-family: Heebo, sans-serif; font-size: 9px; color: #9b9994; width: 100%; padding: 0 14mm; display: flex; justify-content: space-between; direction: rtl;">
          <span>Leaders Research</span>
          <span>עמוד <span class="pageNumber"></span> מתוך <span class="totalPages"></span></span>
        </div>`,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await ctx.params;
  let body: { reportId?: string } = {};
  try {
    body = await req.json();
  } catch {}
  const sb = createSupabaseService();

  let reportId = body.reportId;
  if (!reportId) {
    const { data } = await sb
      .from("research_reports")
      .select("id")
      .eq("job_id", jobId)
      .single();
    reportId = (data as { id: string } | null)?.id;
  }
  if (!reportId) return NextResponse.json({ error: "report not found" }, { status: 404 });

  const appUrl = process.env.APP_URL || new URL(req.url).origin;
  const pdfBytes = await renderPdf(reportId, appUrl);

  // Ensure bucket exists (best-effort; the migration also creates it)
  await sb.storage.createBucket(BUCKET, { public: false }).catch(() => null);

  const path = `${jobId}/${reportId}.pdf`;
  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, pdfBytes, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  await sb.from("research_jobs").update({ pdf_path: path }).eq("id", jobId);
  await sb.from("research_reports").update({ pdf_path: path }).eq("id", reportId);

  return NextResponse.json({ ok: true, path });
}
