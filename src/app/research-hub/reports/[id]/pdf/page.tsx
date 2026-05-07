import Image from "next/image";
import { notFound } from "next/navigation";
import { createSupabaseService } from "@/lib/research-hub/service";
import { ReportView } from "@/components/research-hub/ReportView";
import type { Report } from "@/lib/research-hub/prompts/synthesizer";
import { formatHebrewDate } from "@/lib/research-hub/utils";

/**
 * Print-target page used by Puppeteer to render the PDF. Auth-bypass via a
 * one-time `key` query param matching SUPABASE_SERVICE_ROLE_KEY — only the
 * PDF render route knows it.
 */
export const dynamic = "force-dynamic";

export default async function PdfPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ key?: string }>;
}) {
  const { id } = await params;
  const { key } = await searchParams;
  if (key !== process.env.SUPABASE_SERVICE_ROLE_KEY) notFound();

  const sb = createSupabaseService();
  const { data: rep } = await sb
    .from("research_reports")
    .select("*")
    .eq("id", id)
    .single();
  if (!rep) notFound();

  const report = rep.sections as Report;
  const sources = (rep.sources ?? []) as { url: string; title?: string }[];

  return (
    <div className="pdf-page bg-white text-brand-primary">
      <section className="cover h-[270mm] flex flex-col justify-between p-[28mm_22mm]">
        <header className="flex items-center justify-between">
          <Image src="/logoblack.png" alt="Leaders" width={140} height={48} />
          <span className="text-[10px] tracking-[0.4em] uppercase font-rubik text-brand-secondary">
            Research Report
          </span>
        </header>
        <div>
          <p className="text-[12px] tracking-[0.4em] uppercase font-rubik text-muted-foreground mb-6">
            {formatHebrewDate(rep.created_at as string)}
          </p>
          <h1 className="font-cormorant italic text-[64px] leading-[1.05] text-brand-primary tracking-tight mb-6">
            {report.title}
          </h1>
          {report.subtitle ? (
            <p className="text-[20px] text-brand-secondary leading-snug max-w-[140mm]">
              {report.subtitle}
            </p>
          ) : null}
          <div className="mt-12 inline-block">
            <div className="divider-dotted w-[60mm] mb-3" />
            <p className="text-[11px] tracking-[0.3em] uppercase font-rubik text-brand-gold">
              Prepared by Leaders Research
            </p>
          </div>
        </div>
        <footer className="flex items-end justify-between">
          <p className="text-[10px] text-muted-foreground tracking-[0.2em] uppercase font-rubik">
            Confidential — Internal Use Only
          </p>
          <p className="numeral text-brand-mist text-[120px] leading-none">01</p>
        </footer>
      </section>

      <section className="p-[18mm_22mm]">
        <ReportView report={report} sources={sources} printMode />
      </section>

      <style>{`
        .pdf-page { font-family: var(--font-heebo); }
        .prose-content { font-family: var(--font-heebo); }
        .prose-print { font-size: 12.5px; line-height: 1.7; }
        .prose-print h2, .prose-print h3, .prose-print h4 { color: rgb(var(--brand-primary)); }
        .page-break-section { break-inside: avoid; }
        @page { size: A4; margin: 16mm 14mm; }
        body { background: white; }
        a { color: rgb(var(--brand-secondary)); text-decoration: none; }
      `}</style>
    </div>
  );
}
