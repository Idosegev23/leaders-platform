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
      {/* COVER — full A4 page, gold accent rule, oversized cormorant title */}
      <section className="cover h-[265mm] flex flex-col justify-between p-[28mm_24mm] relative overflow-hidden">
        {/* Top-right corner mark */}
        <div className="absolute top-0 end-0 w-[40mm] h-[40mm] bg-brand-gold-light/40 rounded-bl-full" />

        <header className="flex items-center justify-between relative z-10">
          <Image src="/new_logo.svg" alt="Leaders" width={140} height={42} />
          <span className="text-[10px] tracking-[0.5em] uppercase font-rubik text-brand-secondary">
            Research Report
          </span>
        </header>

        <div className="relative z-10">
          <p className="text-[11px] tracking-[0.5em] uppercase font-rubik text-muted-foreground mb-2">
            {formatHebrewDate(rep.created_at as string)}
          </p>
          <p className="text-[12px] tracking-[0.3em] uppercase font-rubik text-brand-gold mb-8">
            דוח אסטרטגי · Strategic Intelligence
          </p>
          <div className="h-[2px] w-[24mm] bg-brand-gold mb-8" />
          <h1 className="font-cormorant italic text-[60px] leading-[1.04] text-brand-primary tracking-tight mb-6 max-w-[150mm]">
            {report.title}
          </h1>
          {report.subtitle ? (
            <p className="text-[18px] text-brand-secondary leading-snug max-w-[140mm] font-light">
              {report.subtitle}
            </p>
          ) : null}
        </div>

        <footer className="flex items-end justify-between relative z-10">
          <div>
            <p className="text-[10px] text-muted-foreground tracking-[0.3em] uppercase font-rubik mb-1">
              Prepared by Leaders Research
            </p>
            <p className="text-[9px] text-muted-foreground/60 tracking-[0.2em] uppercase font-rubik">
              Confidential — Internal Use Only
            </p>
          </div>
          <p className="numeral text-brand-pearl text-[140px] leading-none -mb-4 -me-2">01</p>
        </footer>
      </section>

      {/* BODY — flows from page 2 onward */}
      <section className="px-[22mm] py-[14mm]">
        <ReportView report={report} sources={sources} printMode />
      </section>

      {/* Print typography polish — applied to ALL print pages */}
      <style>{`
        .pdf-page { font-family: var(--font-heebo); }

        /* COVER always lives on its own page */
        .cover { break-after: page; page-break-after: always; }

        /* Body typography */
        .prose-content { font-family: var(--font-heebo); color: rgb(var(--brand-primary)); }
        .prose-print { font-size: 12.5px; line-height: 1.75; }
        .prose-print p { margin: 0.7em 0; }
        .prose-print h2, .prose-print h3, .prose-print h4 {
          color: rgb(var(--brand-primary));
          font-weight: 600;
          margin-top: 1.4em;
          margin-bottom: 0.5em;
          /* don't orphan a heading at the bottom of a page */
          break-after: avoid;
          page-break-after: avoid;
        }

        /* Lists — tighter, gold bullets */
        .prose-print ul li::marker { color: rgb(var(--brand-accent)); }
        .prose-print ol li::marker { color: rgb(var(--brand-secondary)); font-weight: 600; }
        .prose-print li { margin: 0.25em 0; }

        /* Tables — alternating rows + brand-pearl header */
        .prose-print table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11.5px;
          margin: 0.8em 0;
          break-inside: avoid;
        }
        .prose-print thead { background: rgb(var(--brand-pearl)); }
        .prose-print th {
          padding: 8px 10px;
          text-align: right;
          font-weight: 600;
          color: rgb(var(--brand-primary));
          border-bottom: 1.5px solid rgb(var(--brand-mist));
        }
        .prose-print td {
          padding: 7px 10px;
          border-bottom: 1px solid rgb(var(--brand-mist));
        }
        .prose-print tbody tr:nth-child(even) { background: rgb(var(--brand-pearl) / 0.4); }

        /* Blockquotes — editorial italic with gold rule */
        .prose-print blockquote {
          margin: 1em 0;
          padding-inline-start: 14px;
          border-inline-start: 3px solid rgb(var(--brand-gold));
          font-family: var(--font-cormorant);
          font-style: italic;
          font-size: 14px;
          color: rgb(var(--brand-secondary));
        }

        /* Code inline */
        .prose-print code {
          background: rgb(var(--brand-pearl));
          padding: 1px 5px;
          border-radius: 3px;
          font-size: 11px;
          color: rgb(var(--brand-secondary));
        }

        /* Section spacing in print */
        .page-break-section { break-inside: auto; }
        section.page-break-section + section.page-break-section h2 {
          margin-top: 1.5em;
        }

        /* Sources column-flow — list items shouldn't split between columns */
        .sources-list li { break-inside: avoid; }
        .sources-section { break-before: page; page-break-before: always; }

        /* Recommendation cards stay together */
        .rec-card, .key-numbers-grid > div { break-inside: avoid; }

        /* Hide controls / interactive elements just in case */
        .print\\:hidden, [data-print-hidden] { display: none !important; }

        @page { size: A4; margin: 16mm 14mm; }
        body { background: white; }
        a { color: rgb(var(--brand-secondary)); text-decoration: none; }
      `}</style>
    </div>
  );
}
