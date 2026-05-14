import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { cn } from "@/lib/utils";
import type { Report } from "@/lib/research-hub/prompts/synthesizer";
import type { GradedSource, SourceTier } from "@/lib/research-hub/prompts/source-grader";

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
  // Build a lookup so we can show tier badges next to source numbers if
  // the report was graded (ultra tier only).
  const gradeByUrl = new Map<string, GradedSource>();
  for (const g of report.graded_sources ?? []) gradeByUrl.set(g.url, g);

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

      {report.meeting_prep ? (
        <MeetingPrepBlock prep={report.meeting_prep} printMode={printMode} />
      ) : null}

      {report.exec_brief ? (
        <ExecBriefBlock brief={report.exec_brief} printMode={printMode} />
      ) : null}

      {report.stat_sheet ? (
        <StatSheetBlock sheet={report.stat_sheet} printMode={printMode} />
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
            <div className="key-numbers-grid grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
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
                className="rec-card rounded-2xl border border-[rgb(var(--brand-mist))] bg-white p-6"
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

      {report.decision_tree ? (
        <DecisionTreeBlock tree={report.decision_tree} printMode={printMode} />
      ) : null}

      {report.open_hypotheses?.hypotheses?.length ? (
        <OpenHypothesesBlock list={report.open_hypotheses} printMode={printMode} />
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
        <SourcesBlock
          sources={sources}
          gradeByUrl={gradeByUrl}
          printMode={printMode}
        />
      ) : null}

      {report.critique ? (
        <CritiqueFooter critique={report.critique} printMode={printMode} />
      ) : null}
    </article>
  );
}

// ─── Exec One-Pager block ───────────────────────────────────────────────
// ─── Meeting Prep block — surfaced at the top when mode = 'meeting_prep' ────
function MeetingPrepBlock({
  prep,
  printMode,
}: {
  prep: NonNullable<Report["meeting_prep"]>;
  printMode: boolean;
}) {
  return (
    <section
      className={cn(
        "page-break-section rounded-3xl border border-brand-accent/40 bg-gradient-to-br from-brand-accent/10 via-white to-brand-pearl/40",
        printMode ? "p-6 mb-8" : "p-8 mb-12",
      )}
    >
      <div className="mb-5">
        <SectionLabel>הכנה לפגישה · Meeting Prep</SectionLabel>
      </div>

      <div className="mb-6">
        <div className="text-[11px] tracking-[0.2em] uppercase text-muted-foreground font-rubik mb-2">
          Brand Snapshot
        </div>
        <p className="text-[15px] leading-relaxed text-brand-primary">{prep.brand_snapshot}</p>
      </div>

      {prep.must_know?.length ? (
        <div className="mb-6">
          <div className="text-[11px] tracking-[0.2em] uppercase text-muted-foreground font-rubik mb-2">
            חייבים להכיר לפני הפגישה
          </div>
          <ul className="space-y-1.5 list-disc list-inside">
            {prep.must_know.map((m, i) => (
              <li key={i} className="text-[14px] leading-relaxed">{m}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {prep.talking_points?.length ? (
        <div className="mb-6">
          <div className="text-[11px] tracking-[0.2em] uppercase text-muted-foreground font-rubik mb-2">
            Talking Points
          </div>
          <ul className="space-y-1.5 list-disc list-inside">
            {prep.talking_points.map((t, i) => (
              <li key={i} className="text-[14px] leading-relaxed">{t}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {prep.meeting_questions?.length ? (
        <div className="mb-6">
          <div className="text-[11px] tracking-[0.2em] uppercase text-muted-foreground font-rubik mb-2">
            שאלות מומלצות לפגישה
          </div>
          <ol className="space-y-1.5 list-decimal list-inside">
            {prep.meeting_questions.map((q, i) => (
              <li key={i} className="text-[14px] leading-relaxed">{q}</li>
            ))}
          </ol>
        </div>
      ) : null}

      {prep.leaders_value_proposition?.length ? (
        <div className="pt-4 border-t border-brand-accent/30">
          <div className="text-[11px] tracking-[0.2em] uppercase text-muted-foreground font-rubik mb-2">
            איך לידרס יכולה לעזור — נקודות לעלות בפגישה
          </div>
          <ul className="space-y-1.5 list-disc list-inside">
            {prep.leaders_value_proposition.map((v, i) => (
              <li key={i} className="text-[14px] leading-relaxed">{v}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function ExecBriefBlock({
  brief,
  printMode,
}: {
  brief: NonNullable<Report["exec_brief"]>;
  printMode: boolean;
}) {
  return (
    <section
      className={cn(
        "page-break-section rounded-3xl border border-brand-gold/40 bg-gradient-to-br from-brand-gold-light/30 via-white to-brand-pearl/40",
        printMode ? "p-6 mb-8" : "p-8 mb-12",
      )}
    >
      <div className="flex items-center justify-between mb-4">
        <SectionLabel>Exec One-Pager</SectionLabel>
      </div>
      <h2 className="font-cormorant italic text-3xl text-brand-primary mb-4 leading-tight">
        {brief.title}
      </h2>
      <div className="prose-content text-[14px]">
        <Markdown>{brief.narrative_md}</Markdown>
      </div>
      {brief.numbers_to_remember?.length ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
          {brief.numbers_to_remember.map((n, i) => (
            <div
              key={i}
              className="rounded-xl border border-brand-gold/30 bg-white/70 p-3"
            >
              <div className="text-[10px] tracking-[0.15em] uppercase text-muted-foreground font-rubik">
                {n.label}
              </div>
              <div className="numeral text-xl md:text-2xl text-brand-primary mt-0.5">
                {n.value}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {brief.top_3?.length ? (
        <div className="mt-5">
          <div className="text-[11px] tracking-[0.2em] uppercase text-muted-foreground font-rubik mb-2">
            Top 3
          </div>
          <ol className="space-y-2 list-decimal list-inside">
            {brief.top_3.map((t, i) => (
              <li key={i} className="text-[14px] leading-relaxed">
                <span className="font-semibold text-brand-primary">{t.title}</span>
                <span className="text-muted-foreground"> — {t.one_liner}</span>
                {t.expected_impact ? (
                  <span
                    className={cn(
                      "ms-2 text-[10px] px-1.5 py-0.5 rounded-full",
                      t.expected_impact === "high"
                        ? "bg-emerald-50 text-emerald-800"
                        : t.expected_impact === "medium"
                          ? "bg-amber-50 text-amber-800"
                          : "bg-stone-100 text-stone-700",
                    )}
                  >
                    {t.expected_impact}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      <div className="mt-5 pt-4 border-t border-brand-gold/30">
        <div className="text-[11px] tracking-[0.2em] uppercase text-muted-foreground font-rubik mb-1">
          Bottom Line
        </div>
        <p className="font-cormorant italic text-[18px] text-brand-primary leading-snug">
          {brief.bottom_line}
        </p>
      </div>
    </section>
  );
}

// ─── Stat Sheet block ───────────────────────────────────────────────────
function StatSheetBlock({
  sheet,
  printMode,
}: {
  sheet: NonNullable<Report["stat_sheet"]>;
  printMode: boolean;
}) {
  return (
    <section className={cn(printMode ? "mb-10" : "mb-14", "page-break-section")}>
      <SectionLabel>{sheet.title || "Stat Sheet"}</SectionLabel>
      {sheet.intro ? (
        <p className="text-muted-foreground mb-4 text-[13px]">{sheet.intro}</p>
      ) : null}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {sheet.stats.map((s, i) => (
          <div
            key={i}
            className="rounded-xl border border-[rgb(var(--brand-mist))] bg-white p-4 flex flex-col"
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="text-[11px] tracking-[0.15em] uppercase text-muted-foreground font-rubik">
                {s.label}
              </div>
              <span
                className={cn(
                  "text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded shrink-0",
                  s.kind === "fact"
                    ? "bg-emerald-50 text-emerald-800"
                    : s.kind === "estimate"
                      ? "bg-amber-50 text-amber-800"
                      : "bg-stone-100 text-stone-700",
                )}
              >
                {s.kind}
              </span>
            </div>
            <div className="numeral text-2xl text-brand-primary leading-tight">
              {s.value}
              {s.unit ? <span className="text-base text-muted-foreground ms-1">{s.unit}</span> : null}
            </div>
            <div className="mt-2 text-[12px] text-muted-foreground leading-snug flex-1">
              {s.why_it_matters}
            </div>
            {(s.source_section || s.source_ref) ? (
              <div className="mt-2 text-[10px] text-brand-accent">
                {s.source_section ? `סעיף: ${s.source_section}` : ""}
                {s.source_ref ? ` · [${s.source_ref}]` : ""}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Decision Tree block ────────────────────────────────────────────────
function DecisionTreeBlock({
  tree,
  printMode,
}: {
  tree: NonNullable<Report["decision_tree"]>;
  printMode: boolean;
}) {
  return (
    <section className={cn(printMode ? "mb-10" : "mb-14", "page-break-section")}>
      <SectionLabel>{tree.title || "Decision Tree"}</SectionLabel>
      <p className="font-cormorant italic text-xl text-brand-secondary mb-5 leading-snug">
        {tree.question}
      </p>
      <div className="space-y-3">
        {tree.branches.map((b, i) => (
          <div
            key={i}
            className="rounded-2xl border border-[rgb(var(--brand-mist))] bg-white p-5"
          >
            <div className="flex items-start gap-3 mb-2">
              <span className="numeral text-brand-accent text-[14px] shrink-0 mt-0.5">
                {(i + 1).toString().padStart(2, "0")}
              </span>
              <div className="flex-1">
                <div className="text-[13px] text-muted-foreground mb-1">אם:</div>
                <div className="font-semibold text-brand-primary">{b.condition}</div>
              </div>
              {b.risk ? (
                <span
                  className={cn(
                    "text-[10px] uppercase tracking-widest px-2 py-1 rounded-full shrink-0",
                    b.risk === "high"
                      ? "bg-rose-50 text-rose-800"
                      : b.risk === "medium"
                        ? "bg-amber-50 text-amber-800"
                        : "bg-emerald-50 text-emerald-800",
                  )}
                >
                  סיכון: {b.risk}
                </span>
              ) : null}
            </div>
            <div className="ms-7">
              <div className="text-[13px] text-muted-foreground mt-2 mb-1">אז:</div>
              <div className="text-[14px] mb-3">{b.action}</div>
              <div className="text-[12px] text-muted-foreground italic leading-relaxed">
                {b.rationale}
              </div>
              {b.sub?.length ? (
                <ul className="mt-3 space-y-1.5 ps-4 border-s border-[rgb(var(--brand-mist))]">
                  {b.sub.map((sb, j) => (
                    <li key={j} className="text-[12.5px]">
                      <span className="text-brand-accent">↳</span>{" "}
                      <span className="font-medium">אם {sb.condition}</span> →{" "}
                      <span className="text-muted-foreground">{sb.action}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      {tree.early_signals?.length ? (
        <div className="mt-6 rounded-2xl border border-brand-gold/40 bg-brand-gold-light/20 p-5">
          <div className="text-[11px] tracking-[0.2em] uppercase text-brand-gold font-rubik mb-3">
            Early Signals
          </div>
          <ul className="space-y-2">
            {tree.early_signals.map((es, i) => (
              <li key={i} className="text-[13px] flex gap-2">
                <span className="text-brand-gold shrink-0">●</span>
                <span>
                  <span className="font-semibold text-brand-primary">{es.signal}</span>
                  <span className="text-muted-foreground"> — {es.meaning}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

// ─── Open Hypotheses block ──────────────────────────────────────────────
function OpenHypothesesBlock({
  list,
  printMode,
}: {
  list: NonNullable<Report["open_hypotheses"]>;
  printMode: boolean;
}) {
  return (
    <section className={cn(printMode ? "mb-10" : "mb-14", "page-break-section")}>
      <SectionLabel>היפותזות לבחינה</SectionLabel>
      {list.intro ? (
        <p className="text-muted-foreground mb-4 text-[13px]">{list.intro}</p>
      ) : null}
      <div className="space-y-3">
        {list.hypotheses.map((h, i) => (
          <div
            key={i}
            className="rounded-2xl border border-[rgb(var(--brand-mist))] bg-white p-5"
          >
            <div className="flex items-start gap-3 mb-3">
              <span className="numeral text-brand-accent shrink-0 mt-0.5">
                H{(i + 1).toString().padStart(2, "0")}
              </span>
              <div className="flex-1 font-semibold text-brand-primary leading-snug">
                {h.statement}
              </div>
              <div className="flex flex-col gap-1 shrink-0 text-right">
                {h.impact_if_wrong ? (
                  <span
                    className={cn(
                      "text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded",
                      h.impact_if_wrong === "high"
                        ? "bg-rose-50 text-rose-800"
                        : h.impact_if_wrong === "medium"
                          ? "bg-amber-50 text-amber-800"
                          : "bg-stone-100 text-stone-700",
                    )}
                  >
                    impact: {h.impact_if_wrong}
                  </span>
                ) : null}
                {h.test_cost ? (
                  <span className="text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded bg-stone-100 text-stone-700">
                    cost: {h.test_cost}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="ms-9 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[13px]">
              <div>
                <div className="text-[10px] tracking-[0.15em] uppercase text-muted-foreground font-rubik mb-0.5">
                  Cheap Test
                </div>
                <div>{h.cheap_test}</div>
              </div>
              <div>
                <div className="text-[10px] tracking-[0.15em] uppercase text-muted-foreground font-rubik mb-0.5">
                  Decision Rule
                </div>
                <div>{h.decision_rule}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Critique footer (transparency) ─────────────────────────────────────
function CritiqueFooter({
  critique,
  printMode,
}: {
  critique: NonNullable<Report["critique"]>;
  printMode: boolean;
}) {
  return (
    <section
      className={cn(
        "mt-8 rounded-2xl border border-stone-200 bg-stone-50/60 p-5",
        printMode ? "text-[11px]" : "text-[12px]",
      )}
    >
      <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground font-rubik mb-2">
        שקיפות — דיווח הביקורת
      </div>
      <div className="flex items-center gap-3 mb-2">
        <span
          className={cn(
            "text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full",
            critique.verdict === "strong"
              ? "bg-emerald-50 text-emerald-800"
              : critique.verdict === "acceptable"
                ? "bg-amber-50 text-amber-800"
                : "bg-rose-50 text-rose-800",
          )}
        >
          verdict: {critique.verdict}
        </span>
        <span className="text-muted-foreground">
          {critique.gaps.length} פערים זוהו · הושלמו עד {Math.min(critique.gaps.length, 5)} בלולאת המחקר השנייה
        </span>
      </div>
      {critique.headline_problem ? (
        <p className="italic text-stone-700 mb-2">&ldquo;{critique.headline_problem}&rdquo;</p>
      ) : null}
      <details className="text-stone-600">
        <summary className="cursor-pointer hover:text-brand-primary">
          הצג רשימת פערים מלאה
        </summary>
        <ul className="mt-2 space-y-1.5">
          {critique.gaps.map((g, i) => (
            <li key={i} className="leading-snug">
              <span
                className={cn(
                  "inline-block ms-1 text-[9px] uppercase tracking-widest px-1 py-0.5 rounded align-middle",
                  g.severity === "critical"
                    ? "bg-rose-100 text-rose-800"
                    : g.severity === "high"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-stone-100 text-stone-700",
                )}
              >
                {g.severity}
              </span>{" "}
              <span className="font-medium">{g.gap_description}</span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function tierLabel(tier: SourceTier): string {
  return tier === 1 ? "T1" : tier === 2 ? "T2" : "T3";
}
function tierColor(tier: SourceTier): string {
  return tier === 1
    ? "bg-emerald-50 text-emerald-800"
    : tier === 2
      ? "bg-amber-50 text-amber-800"
      : "bg-stone-100 text-stone-700";
}
function recencyLabel(r: GradedSource["recency"]): string {
  return r === "fresh" ? "12-" : r === "recent" ? "1-3y" : r === "stale" ? "3y+" : "?";
}

function truncate(s: string | undefined, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function SourcesBlock({
  sources,
  gradeByUrl,
  printMode,
}: {
  sources: ReportSource[];
  gradeByUrl: Map<string, GradedSource>;
  printMode: boolean;
}) {
  const total = sources.length;
  const titledCount = sources.filter((s) => s.title && s.title.trim()).length;
  const hosts = new Set(sources.map((s) => hostOf(s.url)));
  const hasGrades = gradeByUrl.size > 0;
  // Compact mode kicks in when sources have no editorial info to show — all
  // identical Google redirector URLs with no titles is the common case for
  // Deep Research output. Render as a clickable index strip instead of a
  // 248-line list that eats 2-3 pages.
  // When grades are available we always render the full list so tier/recency
  // badges are visible.
  const isCompact = !hasGrades && titledCount === 0;
  const singleHost = hosts.size === 1 ? Array.from(hosts)[0] : null;

  const tierCounts: Record<SourceTier, number> = { 1: 0, 2: 0, 3: 0 };
  Array.from(gradeByUrl.values()).forEach((g) => {
    const t = (g.tier === 1 || g.tier === 2 || g.tier === 3 ? g.tier : 3) as SourceTier;
    tierCounts[t] += 1;
  });

  return (
    <section className="sources-section">
      <SectionLabel>מקורות</SectionLabel>
      <p
        className={cn(
          "text-muted-foreground mb-3",
          printMode ? "text-[10px] leading-snug" : "text-[12px]",
        )}
      >
        {total} מקורות{singleHost ? ` (כולם דרך ${singleHost} — Google מנתבת אוטומטית)` : ""}
        {hasGrades
          ? ` · T1: ${tierCounts[1]}, T2: ${tierCounts[2]}, T3: ${tierCounts[3]}`
          : ""}
        . לחיצה על מספר פותחת את הכתובת המקורית.
      </p>

      {isCompact ? (
        <div
          className={cn(
            "flex flex-wrap gap-x-2 gap-y-1.5 text-brand-secondary",
            printMode ? "text-[9.5px]" : "text-[12px]",
          )}
        >
          {sources.map((s, i) => (
            <a
              key={i}
              href={s.url}
              target="_blank"
              rel="noreferrer"
              className={cn(
                "numeral hover:text-brand-accent",
                printMode
                  ? "px-1.5 py-0.5 rounded border border-[rgb(var(--brand-mist))]"
                  : "px-2 py-0.5 rounded-full border border-[rgb(var(--brand-mist))] bg-brand-pearl/40",
              )}
            >
              [{i + 1}]
            </a>
          ))}
        </div>
      ) : (
        <ol
          className={cn(
            "sources-list",
            printMode
              ? "columns-2 gap-x-6 text-[9.5px] leading-snug"
              : "columns-1 sm:columns-2 gap-x-6 text-[12px]",
          )}
        >
          {sources.map((s, i) => {
            const host = hostOf(s.url);
            const grade = gradeByUrl.get(s.url);
            return (
              <li
                key={i}
                className={cn(
                  "break-inside-avoid mb-1.5 flex gap-1.5 items-baseline",
                  printMode ? "" : "leading-relaxed",
                )}
              >
                <span
                  className={cn(
                    "text-brand-accent shrink-0 numeral",
                    printMode ? "text-[9px]" : "text-[11px]",
                  )}
                >
                  [{i + 1}]
                </span>
                {grade ? (
                  <span
                    className={cn(
                      "shrink-0 px-1 py-0.5 rounded text-[9px] tracking-wide",
                      tierColor(grade.tier),
                    )}
                    title={grade.rationale}
                  >
                    {tierLabel(grade.tier)} · {recencyLabel(grade.recency)}
                  </span>
                ) : null}
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-secondary hover:text-brand-accent min-w-0"
                >
                  <span className="font-medium">{truncate(s.title, 80) || host}</span>
                  {s.title ? (
                    <span className="text-muted-foreground"> · {host}</span>
                  ) : null}
                </a>
              </li>
            );
          })}
        </ol>
      )}
    </section>
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
      rehypePlugins={[rehypeRaw]}
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
