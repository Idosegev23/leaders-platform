import { serve } from "@upstash/workflow/nextjs";
import { createSupabaseService } from "@/lib/research-hub/service";
import { reason, MODELS } from "@/lib/research-hub/gemini";
import {
  startDeepResearch,
  getDeepResearch,
  extractFinalText,
  extractSources,
  estimateCostCents,
} from "@/lib/research-hub/deep-research";
import {
  PLANNER_SYSTEM,
  plannerPrompt,
  PLAN_SCHEMA,
} from "@/lib/research-hub/prompts/planner";
import { researcherBrief } from "@/lib/research-hub/prompts/researcher";
import {
  WRITER_SYSTEM,
  writerPrompt,
  REPORT_SCHEMA,
  type Report,
} from "@/lib/research-hub/prompts/synthesizer";
import {
  CRITIC_SYSTEM,
  criticPrompt,
  CRITIC_SCHEMA,
  type Critique,
} from "@/lib/research-hub/prompts/critic";
import {
  GRADER_SYSTEM,
  graderPrompt,
  GRADER_SCHEMA,
  type GradedSource,
} from "@/lib/research-hub/prompts/source-grader";
import {
  statSheetPrompt,
  STAT_SHEET_SCHEMA,
  execBriefPrompt,
  EXEC_BRIEF_SCHEMA,
  decisionTreePrompt,
  DECISION_TREE_SCHEMA,
  openHypothesesPrompt,
  OPEN_HYPOTHESES_SCHEMA,
  type StatSheet,
  type ExecBrief,
  type DecisionTree,
  type OpenHypothesisList,
} from "@/lib/research-hub/prompts/deliverables";
import { ANGLES, ANGLE_GROUPS, getAngles, type AngleId } from "@/lib/research-hub/angles";
import { sendResearchDoneEmail } from "@/lib/research-hub/email";

export const maxDuration = 800;

type Init = { jobId: string };

type Plan = {
  title: string;
  executive_intent: string;
  geography?: string;
  language?: string;
  sub_questions: { angle: AngleId; questions: string[] }[];
  must_know_facts?: string[];
};

const POLL_INTERVAL_SEC = 30;
const MAX_POLLS = 120; // 60 min cap (30s * 120)
const MAX_GAP_FOLLOWUPS = 5;

// Robust JSON parser — Gemini occasionally wraps JSON in fences or adds
// stray prose. Try direct parse, then extract the largest {...} block.
function parseJsonLoose<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("no JSON object found in response");
    return JSON.parse(m[0]) as T;
  }
}

export const { POST } = serve<Init>(
  async (context) => {
    const sb = createSupabaseService();
    const { jobId } = context.requestPayload;

    // ─── Load the job ────────────────────────────────────────────────
    const job = await context.run("load_job", async () => {
      const { data, error } = await sb
        .from("research_jobs")
        .select("*")
        .eq("id", jobId)
        .single();
      if (error || !data) throw new Error(`job ${jobId} not found`);
      return data as {
        id: string;
        user_id: string;
        topic: string;
        brief?: string;
        brand_url?: string | null;
        brand_name?: string | null;
        decision_to_help?: string | null;
        angles: AngleId[];
        depth: "express" | "standard" | "maximum" | "ultra";
        language: "he" | "en";
        notify_email?: string | null;
        mode?: "general" | "meeting_prep" | null;
      };
    });

    const event = (
      step: string,
      status: "started" | "progress" | "done" | "error",
      message?: string,
      data?: unknown,
    ) =>
      sb.from("research_job_events").insert({
        job_id: jobId,
        step,
        status,
        message,
        data: (data ?? null) as never,
      });

    // ─── 1. PLAN ─────────────────────────────────────────────────────
    const plan = await context.run<Plan>("plan", async () => {
      await event("plan", "started", "מפרק את הנושא לשאלות מחקר");
      await sb.from("research_jobs").update({ status: "planning" }).eq("id", jobId);
      const { text } = await reason({
        prompt: plannerPrompt({
          topic: job.topic,
          brief: job.brief,
          brandUrl: job.brand_url ?? undefined,
          decisionToHelp: job.decision_to_help ?? undefined,
          angles: job.angles,
        }),
        systemInstruction: PLANNER_SYSTEM,
        responseSchema: PLAN_SCHEMA,
        model: MODELS.reasoning,
        thinkingLevel: job.depth === "ultra" ? "HIGH" : "MEDIUM",
      });
      const parsed = parseJsonLoose<Plan>(text);
      await sb.from("research_jobs").update({ plan: parsed as never }).eq("id", jobId);
      await event("plan", "done", "תוכנית מחקר מוכנה", {
        title: parsed.title,
        questions: parsed.sub_questions.length,
      });
      return parsed;
    });

    // ─── 2. RESEARCH ─────────────────────────────────────────────────
    // CRITICAL: any side effect outside context.run replays on every step
    // invocation, which overrides later status updates (e.g. "done" gets
    // reset to "researching" on the workflow's final tick).
    await context.run("set_researching", async () => {
      await sb.from("research_jobs").update({ status: "researching" }).eq("id", jobId);
    });

    type Bucket = { id: string; label: string; brief: string };

    const brandLine = job.brand_url
      ? `Brand under analysis: ${job.brand_url} — when an angle relates to this brand (best_sellers / brand_deep_dive / brand_ideas / branding_recommendations / labeling_recommendations / pricing / cost_analysis), fetch this site directly (catalog, About, news), inspect product pages, prices and copy, and pull every public mention of the brand.`
      : "";

    const decisionLine = job.decision_to_help
      ? `Decision this research must help make: ${job.decision_to_help}`
      : "";

    const buckets: Bucket[] = (() => {
      if (job.depth === "express") {
        return [
          {
            id: "all",
            label: "מחקר מקיף",
            brief: [
              `Topic: ${job.topic}`,
              brandLine,
              decisionLine,
              job.brief ? `Brief:\n${job.brief}\n` : "",
              "Cover ALL of these angles in one comprehensive report:",
              ...ANGLES.filter((a) => job.angles.includes(a.id)).map(
                (a) => `- ${a.english}: ${a.briefingHe}`,
              ),
              "",
              `Output language: ${job.language === "he" ? "Hebrew" : "English"}.`,
              "Use precise numbers; cite sources inline. Drill down to SKU/brand level — no generic statements.",
            ]
              .filter(Boolean)
              .join("\n"),
          },
        ];
      }
      if (job.depth === "standard") {
        return ANGLE_GROUPS.filter((g) =>
          g.angles.some((a) => job.angles.includes(a)),
        ).map((g) => {
          const groupAngles = getAngles(
            g.angles.filter((a) => job.angles.includes(a)),
          );
          const qs = plan.sub_questions
            .filter((s) => g.angles.includes(s.angle))
            .flatMap((s) => s.questions);
          return {
            id: g.id,
            label: g.label,
            brief: [
              `Topic: ${job.topic}`,
              `Geography: ${plan.geography ?? "Israel + global comparables"}`,
              brandLine,
              decisionLine,
              "",
              "Research the following angles in depth:",
              ...groupAngles.map((a) => `- ${a.english}: ${a.briefingHe}`),
              "",
              "Specific sub-questions to answer:",
              ...qs.map((q, i) => `${i + 1}. ${q}`),
              "",
              `Output language: ${job.language === "he" ? "Hebrew" : "English"}.`,
              "Use precise numbers and inline source citations. Quantify wherever possible. For best_sellers/pricing/cost_analysis/brand_deep_dive — produce comparison tables with named SKUs.",
            ]
              .filter(Boolean)
              .join("\n"),
          };
        });
      }
      // maximum & ultra: one bucket per angle (ultra includes all angles by default)
      return job.angles.map((aid) => {
        const angle = ANGLES.find((a) => a.id === aid)!;
        const qs =
          plan.sub_questions.find((s) => s.angle === aid)?.questions ?? [];
        return {
          id: aid,
          label: angle.label,
          brief: researcherBrief({
            topic: job.topic,
            geography: plan.geography,
            brandUrl: job.brand_url ?? undefined,
            brandName: job.brand_name ?? undefined,
            decisionToHelp: job.decision_to_help ?? undefined,
            angle,
            questions: qs,
            language: job.language,
            mode: job.mode === "meeting_prep" ? "meeting_prep" : "general",
          }),
        };
      });
    })();

    type Started = { bucketId: string; label: string; interactionId: string };
    const started = await context.run<Started[]>("start_research", async () => {
      const out: Started[] = [];
      for (const b of buckets) {
        await event("research:" + b.id, "started", `מתחיל מחקר: ${b.label}`);
        const { id } = await startDeepResearch({
          topic: b.brief,
          language: job.language,
        });
        out.push({ bucketId: b.id, label: b.label, interactionId: id });
        await event("research:" + b.id, "progress", `interaction ${id} פעיל`, {
          interactionId: id,
        });
      }
      return out;
    });

    type ResearchResult = {
      bucketId: string;
      label: string;
      text: string;
      sources: { url: string; title?: string }[];
      cost_cents: number;
    };

    const results: ResearchResult[] = [];
    for (const s of started) {
      let polls = 0;
      while (polls < MAX_POLLS) {
        await context.sleep(`wait_${s.bucketId}_${polls}`, POLL_INTERVAL_SEC);
        polls++;
        const status = await context.run(
          `poll_${s.bucketId}_${polls}`,
          async () => {
            const r = await getDeepResearch(s.interactionId);
            await event(
              "research:" + s.bucketId,
              "progress",
              `סטטוס: ${r.status} (poll #${polls})`,
              { status: r.status },
            );
            if (r.status === "completed") {
              const text = extractFinalText(r);
              const sources = extractSources(r);
              const cost = estimateCostCents(r.usage);
              await event(
                "research:" + s.bucketId,
                "done",
                `הושלם — ${sources.length} מקורות`,
                { sources: sources.length, chars: text.length },
              );
              return { done: true as const, text, sources, cost };
            }
            if (r.status === "failed" || r.status === "cancelled" || r.status === "incomplete") {
              throw new Error(`Deep Research ${s.bucketId}: ${r.status} — ${r.error ?? "no error"}`);
            }
            return { done: false as const };
          },
        );
        if (status.done) {
          results.push({
            bucketId: s.bucketId,
            label: s.label,
            text: status.text,
            sources: status.sources,
            cost_cents: status.cost,
          });
          break;
        }
      }
      if (!results.find((r) => r.bucketId === s.bucketId)) {
        throw new Error(`Deep Research ${s.bucketId} timed out after ${MAX_POLLS} polls`);
      }
    }

    await context.run("save_findings", async () => {
      const findings = Object.fromEntries(
        results.map((r) => [r.bucketId, { text: r.text, sources: r.sources }]),
      );
      const totalCost = results.reduce((s, r) => s + r.cost_cents, 0);
      await sb
        .from("research_jobs")
        .update({
          findings: findings as never,
          status: "synthesizing",
          cost_cents: totalCost,
        })
        .eq("id", jobId);
    });

    // ─── Helper to dedupe + flatten sources across passes ───────────
    const buildSourceList = (rs: ResearchResult[]): { url: string; title?: string }[] => {
      const all: { url: string; title?: string }[] = [];
      const seen = new Set<string>();
      for (const r of rs) {
        for (const s of r.sources) {
          if (!seen.has(s.url)) {
            seen.add(s.url);
            all.push(s);
          }
        }
      }
      return all;
    };

    // ─── 3. FIRST SYNTHESIS ──────────────────────────────────────────
    const firstReport = await context.run<Report>("synthesize", async () => {
      await event("synthesize", "started", "כותב דוח מאוחד");
      const allSources = buildSourceList(results);
      const rawResearch = results
        .map((r) => `=== ${r.label} ===\n\n${r.text}`)
        .join("\n\n");

      const { text } = await reason({
        prompt: writerPrompt({
          topic: job.topic,
          brief: job.brief,
          decision: job.decision_to_help ?? undefined,
          geography: plan.geography,
          brandUrl: job.brand_url ?? undefined,
          brandName: job.brand_name ?? undefined,
          rawResearch,
          sources: allSources,
          language: job.language,
          mode: job.mode === "meeting_prep" ? "meeting_prep" : "general",
        }),
        systemInstruction: WRITER_SYSTEM,
        responseSchema: REPORT_SCHEMA,
        model: MODELS.reasoning,
        thinkingLevel: "HIGH",
      });
      const parsed = parseJsonLoose<Report>(text);
      await event("synthesize", "done", "טיוטה ראשונה מוכנה");
      return parsed;
    });

    // ─── 4. CRITIC LOOP (ultra only) ─────────────────────────────────
    let report: Report = firstReport;
    let allResults: ResearchResult[] = [...results];

    if (job.depth === "ultra") {
      const critique = await context.run<Critique>("critic", async () => {
        await event("critic", "started", "מבקר את הטיוטה ומאתר פערים");
        const { text } = await reason({
          prompt: criticPrompt({
            topic: job.topic,
            brandUrl: job.brand_url ?? undefined,
            decision: job.decision_to_help ?? undefined,
            report: firstReport,
          }),
          systemInstruction: CRITIC_SYSTEM,
          responseSchema: CRITIC_SCHEMA,
          model: MODELS.reasoning,
          thinkingLevel: "HIGH",
        });
        const parsed = parseJsonLoose<Critique>(text);
        await event("critic", "done", `verdict: ${parsed.verdict} — ${parsed.gaps.length} פערים`, {
          verdict: parsed.verdict,
          gaps: parsed.gaps.length,
        });
        return parsed;
      });

      // Pick the top N gaps by severity, run targeted follow-up Deep Research.
      const severityRank: Record<string, number> = { critical: 3, high: 2, medium: 1 };
      const pickedGaps = [...critique.gaps]
        .sort((a, b) => (severityRank[b.severity] ?? 0) - (severityRank[a.severity] ?? 0))
        .slice(0, MAX_GAP_FOLLOWUPS);

      if (pickedGaps.length > 0) {
        const gapBuckets: Bucket[] = pickedGaps.map((g, i) => ({
          id: `gap_${i + 1}`,
          label: `השלמה #${i + 1}: ${g.gap_description.slice(0, 60)}`,
          brief: [
            `Topic: ${job.topic}`,
            brandLine,
            decisionLine,
            `Geography: ${plan.geography ?? "Israel + global comparables"}`,
            "",
            "This is a TARGETED follow-up to fill a specific gap identified by the critic.",
            `Original gap: ${g.gap_description}`,
            g.why_it_matters ? `Why it matters: ${g.why_it_matters}` : "",
            "",
            `Specific question to answer fully: ${g.followup_query}`,
            "",
            "Be exhaustive on THIS question only. Cite every claim. Use precise numbers.",
            `Output language: ${job.language === "he" ? "Hebrew" : "English"}.`,
          ]
            .filter(Boolean)
            .join("\n"),
        }));

        const gapStarted = await context.run<Started[]>(
          "start_gap_research",
          async () => {
            const out: Started[] = [];
            for (const b of gapBuckets) {
              await event("research:" + b.id, "started", `השלמה: ${b.label}`);
              const { id } = await startDeepResearch({
                topic: b.brief,
                language: job.language,
              });
              out.push({ bucketId: b.id, label: b.label, interactionId: id });
              await event("research:" + b.id, "progress", `interaction ${id} פעיל`, {
                interactionId: id,
              });
            }
            return out;
          },
        );

        const gapResults: ResearchResult[] = [];
        for (const s of gapStarted) {
          let polls = 0;
          while (polls < MAX_POLLS) {
            await context.sleep(`gap_wait_${s.bucketId}_${polls}`, POLL_INTERVAL_SEC);
            polls++;
            const status = await context.run(
              `gap_poll_${s.bucketId}_${polls}`,
              async () => {
                const r = await getDeepResearch(s.interactionId);
                await event(
                  "research:" + s.bucketId,
                  "progress",
                  `סטטוס: ${r.status} (poll #${polls})`,
                  { status: r.status },
                );
                if (r.status === "completed") {
                  const text = extractFinalText(r);
                  const sources = extractSources(r);
                  const cost = estimateCostCents(r.usage);
                  await event(
                    "research:" + s.bucketId,
                    "done",
                    `הושלם — ${sources.length} מקורות`,
                    { sources: sources.length, chars: text.length },
                  );
                  return { done: true as const, text, sources, cost };
                }
                if (r.status === "failed" || r.status === "cancelled" || r.status === "incomplete") {
                  throw new Error(`Gap research ${s.bucketId}: ${r.status} — ${r.error ?? "no error"}`);
                }
                return { done: false as const };
              },
            );
            if (status.done) {
              gapResults.push({
                bucketId: s.bucketId,
                label: s.label,
                text: status.text,
                sources: status.sources,
                cost_cents: status.cost,
              });
              break;
            }
          }
          if (!gapResults.find((r) => r.bucketId === s.bucketId)) {
            // Don't fail the whole job on a single timed-out gap — note it and move on.
            await context.run(`gap_timeout_${s.bucketId}`, async () => {
              await event(
                "research:" + s.bucketId,
                "error",
                `השלמה ${s.bucketId} פג תוקף — מתעלמים ועוברים לסינתזה`,
              );
            });
          }
        }

        allResults = [...results, ...gapResults];

        await context.run("save_gap_findings", async () => {
          const totalCost = allResults.reduce((s, r) => s + r.cost_cents, 0);
          await sb
            .from("research_jobs")
            .update({ cost_cents: totalCost })
            .eq("id", jobId);
        });

        // ─── Second synthesis with merged data ─────────────────────────
        report = await context.run<Report>("synthesize_v2", async () => {
          await event("synthesize_v2", "started", "כותב גרסה שנייה עם השלמות הביקורת");
          const allSources = buildSourceList(allResults);
          const rawResearch = allResults
            .map((r) => `=== ${r.label} ===\n\n${r.text}`)
            .join("\n\n");

          const { text } = await reason({
            prompt: writerPrompt({
              topic: job.topic,
              brief: job.brief,
              decision: job.decision_to_help ?? undefined,
              geography: plan.geography,
              brandUrl: job.brand_url ?? undefined,
              brandName: job.brand_name ?? undefined,
              rawResearch,
              sources: allSources,
              language: job.language,
              isFollowupPass: true,
              mode: job.mode === "meeting_prep" ? "meeting_prep" : "general",
            }),
            systemInstruction: WRITER_SYSTEM,
            responseSchema: REPORT_SCHEMA,
            model: MODELS.reasoning,
            thinkingLevel: "HIGH",
          });
          const parsed = parseJsonLoose<Report>(text);
          parsed.critique = critique;
          await event("synthesize_v2", "done", "סינתזה שנייה הושלמה");
          return parsed;
        });
      } else {
        report.critique = critique;
      }

      // ─── 5. GRADE SOURCES ────────────────────────────────────────
      const gradedSources = await context.run<GradedSource[]>("grade_sources", async () => {
        await event("grade_sources", "started", "מדרג מקורות לפי איכות, עדכניות וביטחון");
        const allSources = buildSourceList(allResults);
        if (allSources.length === 0) return [];
        const { text } = await reason({
          prompt: graderPrompt({ sources: allSources }),
          systemInstruction: GRADER_SYSTEM,
          responseSchema: GRADER_SCHEMA,
          model: MODELS.reasoning,
          thinkingLevel: "MEDIUM",
        });
        const parsed = parseJsonLoose<{ graded: GradedSource[] }>(text);
        await event("grade_sources", "done", `${parsed.graded.length} מקורות דורגו`);
        return parsed.graded;
      });
      report.graded_sources = gradedSources;

      // ─── 6. EXTRA DELIVERABLES (parallel-ish — separate steps) ────
      report.stat_sheet = await context.run<StatSheet>("stat_sheet", async () => {
        await event("stat_sheet", "started", "מחלץ Stat Sheet");
        const { text } = await reason({
          prompt: statSheetPrompt({ topic: job.topic, report }),
          responseSchema: STAT_SHEET_SCHEMA,
          model: MODELS.reasoning,
          thinkingLevel: "MEDIUM",
        });
        const parsed = parseJsonLoose<StatSheet>(text);
        await event("stat_sheet", "done", `${parsed.stats.length} מספרים`);
        return parsed;
      });

      report.exec_brief = await context.run<ExecBrief>("exec_brief", async () => {
        await event("exec_brief", "started", "כותב Exec One-Pager");
        const { text } = await reason({
          prompt: execBriefPrompt({
            topic: job.topic,
            decision: job.decision_to_help ?? undefined,
            report,
          }),
          responseSchema: EXEC_BRIEF_SCHEMA,
          model: MODELS.reasoning,
          thinkingLevel: "HIGH",
        });
        const parsed = parseJsonLoose<ExecBrief>(text);
        await event("exec_brief", "done", "One-Pager מוכן");
        return parsed;
      });

      report.decision_tree = await context.run<DecisionTree>("decision_tree", async () => {
        await event("decision_tree", "started", "בונה Decision Tree");
        const { text } = await reason({
          prompt: decisionTreePrompt({
            topic: job.topic,
            decision: job.decision_to_help ?? undefined,
            report,
          }),
          responseSchema: DECISION_TREE_SCHEMA,
          model: MODELS.reasoning,
          thinkingLevel: "HIGH",
        });
        const parsed = parseJsonLoose<DecisionTree>(text);
        await event("decision_tree", "done", `${parsed.branches.length} ענפים`);
        return parsed;
      });

      report.open_hypotheses = await context.run<OpenHypothesisList>("open_hypotheses", async () => {
        await event("open_hypotheses", "started", "מזהה היפותזות לבחינה");
        const { text } = await reason({
          prompt: openHypothesesPrompt({
            topic: job.topic,
            decision: job.decision_to_help ?? undefined,
            report,
          }),
          responseSchema: OPEN_HYPOTHESES_SCHEMA,
          model: MODELS.reasoning,
          thinkingLevel: "MEDIUM",
        });
        const parsed = parseJsonLoose<OpenHypothesisList>(text);
        await event("open_hypotheses", "done", `${parsed.hypotheses.length} היפותזות`);
        return parsed;
      });
    }

    // ─── 7. PERSIST + REPORTS ROW ────────────────────────────────────
    const reportId = await context.run("save_report", async () => {
      const allSources = buildSourceList(allResults);
      await sb
        .from("research_jobs")
        .update({
          report_sections: report as never,
          status: "rendering",
        })
        .eq("id", jobId);
      const { data: rep, error } = await sb
        .from("research_reports")
        .insert({
          job_id: jobId,
          user_id: job.user_id,
          title: report.title,
          topic: job.topic,
          sections: report as never,
          sources: allSources as never,
        })
        .select("id")
        .single();
      if (error || !rep) throw new Error(`save_report: ${error?.message}`);
      return rep.id as string;
    });

    // ─── 8. RENDER PDF (in-process via fetch) ────────────────────────
    const appUrl = process.env.APP_URL ?? context.url.replace(/\/api\/.*$/, "");
    const pdfResult = await context.run("render_pdf", async () => {
      try {
        const res = await fetch(`${appUrl}/api/research-hub/pdf/${jobId}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reportId }),
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          await event("pdf", "error", `יצירת PDF נכשלה (${res.status}): ${detail.slice(0, 200)}`);
          return { ok: false };
        }
        await event("pdf", "done", "PDF נוצר");
        return { ok: true };
      } catch (e) {
        await event(
          "pdf",
          "error",
          `יצירת PDF נכשלה: ${(e as Error).message?.slice(0, 200) ?? "unknown"}`,
        );
        return { ok: false };
      }
    });
    const pdfRendered = pdfResult.ok;

    // ─── 9. NOTIFY ───────────────────────────────────────────────────
    if (job.notify_email) {
      await context.run("notify_email", async () => {
        try {
          const sent = await sendResearchDoneEmail({
            jobUserId: job.user_id,
            toEmail: job.notify_email!,
            topic: job.topic,
            title: report.title,
            subtitle: report.subtitle,
            executiveSummary: report.executive_summary,
            reportUrl: `${appUrl}/research-hub/reports/${reportId}`,
            jobUrl: `${appUrl}/research-hub/jobs/${jobId}`,
            pdfUrl: pdfRendered ? `${appUrl}/api/research-hub/pdf/${jobId}/download` : null,
          });
          await event(
            "notify",
            "done",
            `מייל נשלח אל ${job.notify_email} מ-${sent.from}`,
            { messageId: sent.messageId, from: sent.from },
          );
        } catch (e) {
          await event(
            "notify",
            "error",
            `שליחת המייל נכשלה: ${(e as Error).message?.slice(0, 200) ?? "unknown"}`,
          );
        }
      });
    }

    // ─── 10. FINALIZE ────────────────────────────────────────────────
    await context.run("finalize", async () => {
      await sb
        .from("research_jobs")
        .update({ status: "done", finished_at: new Date().toISOString() })
        .eq("id", jobId);
      await event("done", "done", "הדוח מוכן לצפייה");
    });
  },
  {
    failureFunction: async ({ context, failResponse, failStatus }) => {
      try {
        const sb = createSupabaseService();
        const payload = context.requestPayload as Init;
        const errMsg = `${failStatus}: ${failResponse?.slice(0, 500) ?? "unknown"}`;
        await sb.from("research_jobs").update({
          status: "failed",
          error: errMsg,
          finished_at: new Date().toISOString(),
        }).eq("id", payload.jobId);
        await sb.from("research_job_events").insert({
          job_id: payload.jobId,
          step: "workflow",
          status: "error",
          message: errMsg,
        });
      } catch {}
    },
  },
);
