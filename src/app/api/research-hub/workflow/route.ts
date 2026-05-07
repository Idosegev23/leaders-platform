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
        angles: AngleId[];
        depth: "express" | "standard" | "maximum";
        language: "he" | "en";
        notify_email?: string | null;
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
          angles: job.angles,
        }),
        systemInstruction: PLANNER_SYSTEM,
        responseSchema: PLAN_SCHEMA,
        model: MODELS.reasoning,
        thinkingLevel: "MEDIUM",
      });
      let parsed: Plan;
      try {
        parsed = JSON.parse(text);
      } catch {
        const m = text.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(m ? m[0] : text);
      }
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

    const buckets: Bucket[] = (() => {
      if (job.depth === "express") {
        return [
          {
            id: "all",
            label: "מחקר מקיף",
            brief: [
              `Topic: ${job.topic}`,
              job.brief ? `Brief:\n${job.brief}\n` : "",
              "Cover ALL of these angles in one comprehensive report:",
              ...ANGLES.map((a) => `- ${a.english}: ${a.briefingHe}`),
              "",
              `Output language: ${job.language === "he" ? "Hebrew" : "English"}.`,
              "Use precise numbers; cite sources inline.",
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
              "",
              "Research the following angles in depth:",
              ...groupAngles.map((a) => `- ${a.english}: ${a.briefingHe}`),
              "",
              "Specific sub-questions to answer:",
              ...qs.map((q, i) => `${i + 1}. ${q}`),
              "",
              `Output language: ${job.language === "he" ? "Hebrew" : "English"}.`,
              "Use precise numbers and inline source citations. Quantify wherever possible.",
            ].join("\n"),
          };
        });
      }
      // maximum: one bucket per angle
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
            angle,
            questions: qs,
            language: job.language,
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

    // ─── 3. SYNTHESIZE / WRITE ───────────────────────────────────────
    const report = await context.run<Report>("synthesize", async () => {
      await event("synthesize", "started", "כותב דוח מאוחד");
      const allSources: { url: string; title?: string }[] = [];
      const seen = new Set<string>();
      for (const r of results) {
        for (const s of r.sources) {
          if (!seen.has(s.url)) {
            seen.add(s.url);
            allSources.push(s);
          }
        }
      }
      const rawResearch = results
        .map((r) => `=== ${r.label} ===\n\n${r.text}`)
        .join("\n\n");

      const { text } = await reason({
        prompt: writerPrompt({
          topic: job.topic,
          brief: job.brief,
          geography: plan.geography,
          rawResearch,
          sources: allSources,
          language: job.language,
        }),
        systemInstruction: WRITER_SYSTEM,
        responseSchema: REPORT_SCHEMA,
        model: MODELS.reasoning,
        thinkingLevel: "HIGH",
      });
      let parsed: Report;
      try {
        parsed = JSON.parse(text);
      } catch {
        const m = text.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(m ? m[0] : text);
      }
      await event("synthesize", "done", "הדוח מוכן");
      return parsed;
    });

    // ─── 4. PERSIST + REPORTS ROW ────────────────────────────────────
    const reportId = await context.run("save_report", async () => {
      const allSources: { url: string; title?: string }[] = [];
      const seen = new Set<string>();
      for (const r of results) {
        for (const s of r.sources) {
          if (!seen.has(s.url)) {
            seen.add(s.url);
            allSources.push(s);
          }
        }
      }
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

    // ─── 5. RENDER PDF (out of process via context.call) ─────────────
    // The hub bundles @sparticuz/chromium so this works without any extra
    // env vars. Wrapped in try/catch so a PDF failure doesn't abort the
    // whole workflow — the on-screen report is still available regardless.
    const appUrl = process.env.APP_URL ?? context.url.replace(/\/api\/.*$/, "");
    let pdfRendered = false;
    try {
      await context.call("render_pdf", {
        url: `${appUrl}/api/research-hub/pdf/${jobId}`,
        method: "POST",
        body: JSON.stringify({ reportId }),
        headers: { "content-type": "application/json" },
        retries: 1,
        timeout: 600,
      });
      pdfRendered = true;
      await context.run("pdf_done_event", async () => {
        await event("pdf", "done", "PDF נוצר");
      });
    } catch (e) {
      await context.run("pdf_failed_event", async () => {
        await event(
          "pdf",
          "error",
          `יצירת PDF נכשלה: ${(e as Error).message?.slice(0, 200) ?? "unknown"}`,
        );
      });
    }

    // ─── 6. NOTIFY (direct via Gmail API — no webhook needed) ────────
    // Borrows the OAuth refresh token of one of the Leaders users in
    // user_google_tokens to send the email. Owner first, then most-recent
    // fallback for dev-mode jobs whose user_id isn't a real auth user.
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

    // ─── 7. FINALIZE ─────────────────────────────────────────────────
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
