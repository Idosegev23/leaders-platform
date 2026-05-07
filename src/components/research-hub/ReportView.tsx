import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import type { Report } from "@/lib/research-hub/prompts/synthesizer";

export type ReportSource = { url: string; title?: string };

export function ReportView({
  report,
  sources,
  printMode = false,
}: {
  report: Report;
  sources: ReportSource[];
  printMode?: boolean;
}) {
  return (
    <article
      className={cn("leading-relaxed", printMode ? "text-[13px]" : "text-[15px]")}
    >
      {!printMode ? (
        <header className="mb-12">
          <p className="text-[11px] tracking-[0.4em] uppercase text-muted-foreground font-rubik mb-3">
            Leaders Research Report
          </p>
          <h1 className="font-cormorant italic text-4xl md:text-5xl text-brand-primary leading-tight">
            {report.title}
          </h1>
          {report.subtitle ? (
            <p className="mt-3 text-[16px] text-muted-foreground">{report.subtitle}</p>
          ) : null}
        </header>
      ) : null}

      <section className={printMode ? "mb-10" : "mb-14"}>
        <SectionLabel>תקציר מנהלים</SectionLabel>
        <div className={cn("prose-content", printMode && "prose-print")}>
          <Markdown>{report.executive_summary}</Markdown>
        </div>
        {report.headline_findings?.length ? (
          <ul className="mt-6 space-y-2">
            {report.headline_findings.map((f, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-2 size-1.5 rounded-full bg-brand-accent shrink-0" />
                <span className="leading-relaxed">{f}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {report.sections.map((s, idx) => (
        <section
          key={s.id ?? idx}
          className={cn(printMode ? "mb-10" : "mb-14", "page-break-section")}
        >
          <SectionLabel>{`${(idx + 1).toString().padStart(2, "0")} · ${s.title}`}</SectionLabel>
          {s.lead ? (
            <p className="font-cormorant italic text-[20px] md:text-[22px] text-brand-secondary leading-snug mb-5">
              {s.lead}
            </p>
          ) : null}
          {s.key_numbers?.length ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
              {s.key_numbers.map((kn, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-[rgb(var(--brand-mist))] bg-brand-pearl/40 p-4"
                >
                  <div className="text-[11px] tracking-[0.15em] uppercase text-muted-foreground font-rubik">
                    {kn.label}
                  </div>
                  <div className="mt-1 numeral text-2xl md:text-3xl text-brand-primary">
                    {kn.value}
                  </div>
                  {kn.source ? (
                    <div className="mt-1 text-[11px] text-brand-accent">[{kn.source}]</div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
          <div className={cn("prose-content", printMode && "prose-print")}>
            <Markdown>{s.body_md}</Markdown>
          </div>
        </section>
      ))}

      {report.recommendations?.length ? (
        <section className={cn(printMode ? "mb-10" : "mb-14", "page-break-section")}>
          <SectionLabel>המלצות אסטרטגיות</SectionLabel>
          <div className="space-y-5">
            {report.recommendations.map((r, i) => (
              <div
                key={i}
                className="rounded-2xl border border-[rgb(var(--brand-mist))] bg-white p-6"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <h3 className="font-cormorant italic text-2xl text-brand-primary">
                    {(i + 1).toString().padStart(2, "0")} · {r.title}
                  </h3>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    {r.horizon ? (
                      <span className="text-[11px] px-2 py-1 rounded-full bg-brand-pearl text-brand-primary">
                        {r.horizon}
                      </span>
                    ) : null}
                    {r.risk ? (
                      <span className="text-[11px] px-2 py-1 rounded-full bg-amber-50 text-amber-800">
                        סיכון: {r.risk}
                      </span>
                    ) : null}
                    {r.expected_impact ? (
                      <span className="text-[11px] px-2 py-1 rounded-full bg-emerald-50 text-emerald-800">
                        השפעה: {r.expected_impact}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="mb-3">
                  <h4 className="text-[12px] tracking-[0.15em] uppercase text-muted-foreground font-rubik mb-1">
                    Rationale
                  </h4>
                  <div className="prose-content">
                    <Markdown>{r.rationale_md}</Markdown>
                  </div>
                </div>
                <div>
                  <h4 className="text-[12px] tracking-[0.15em] uppercase text-muted-foreground font-rubik mb-1">
                    Playbook
                  </h4>
                  <div className="prose-content">
                    <Markdown>{r.playbook_md}</Markdown>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {report.open_questions?.length ? (
        <section className={cn(printMode ? "mb-10" : "mb-14")}>
          <SectionLabel>שאלות פתוחות</SectionLabel>
          <ul className="space-y-2">
            {report.open_questions.map((q, i) => (
              <li key={i} className="flex gap-3">
                <span className="text-brand-gold">?</span>
                <span>{q}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {sources.length ? (
        <section className="page-break-section">
          <SectionLabel>מקורות</SectionLabel>
          <ol className="space-y-1.5">
            {sources.map((s, i) => (
              <li key={i} className="flex gap-3 text-[13px]">
                <span className="text-brand-accent shrink-0 numeral">[{i + 1}]</span>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-secondary hover:text-brand-accent break-all"
                >
                  {s.title || s.url}
                </a>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </article>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <h2 className="text-[12px] tracking-[0.3em] uppercase text-muted-foreground font-rubik">
        {children}
      </h2>
      <div className="flex-1 divider-dotted" />
    </div>
  );
}

function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: (p) => <h2 className="text-2xl font-semibold text-brand-primary mt-6 mb-3" {...p} />,
        h2: (p) => <h3 className="text-xl font-semibold text-brand-primary mt-5 mb-2" {...p} />,
        h3: (p) => <h4 className="text-lg font-semibold text-brand-primary mt-4 mb-2" {...p} />,
        p: (p) => <p className="my-3 leading-relaxed" {...p} />,
        ul: (p) => (
          <ul className="my-3 list-disc list-inside space-y-1 marker:text-brand-accent" {...p} />
        ),
        ol: (p) => <ol className="my-3 list-decimal list-inside space-y-1" {...p} />,
        li: (p) => <li className="leading-relaxed" {...p} />,
        table: (p) => (
          <div className="my-4 overflow-x-auto rounded-xl border border-[rgb(var(--brand-mist))]">
            <table className="w-full text-[13px]" {...p} />
          </div>
        ),
        thead: (p) => <thead className="bg-brand-pearl/60" {...p} />,
        th: (p) => (
          <th
            className="text-right p-3 font-semibold text-brand-primary border-b border-[rgb(var(--brand-mist))]"
            {...p}
          />
        ),
        td: (p) => <td className="p-3 border-b border-[rgb(var(--brand-mist))]/50" {...p} />,
        a: (p) => <a className="text-brand-accent hover:underline" target="_blank" rel="noreferrer" {...p} />,
        blockquote: (p) => (
          <blockquote
            className="my-4 border-s-4 border-brand-gold ps-4 italic text-brand-secondary font-cormorant"
            {...p}
          />
        ),
        code: (p) => (
          <code className="px-1 py-0.5 rounded bg-brand-pearl text-brand-secondary text-[12px]" {...p} />
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
