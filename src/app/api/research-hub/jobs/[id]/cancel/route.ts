import { NextResponse } from "next/server";
import { Client as WorkflowClient } from "@upstash/workflow";
import { createClient as createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseService } from "@/lib/research-hub/service";
import { isDevMode } from "@/lib/auth/dev-mode";
import { cancelDeepResearch } from "@/lib/research-hub/deep-research";

const TERMINAL_STATUSES = new Set(["done", "failed", "cancelled"]);

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  if (!isDevMode) {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const sb = createSupabaseService();
  const { data: job, error } = await sb
    .from("research_jobs")
    .select("id, status, workflow_run_id, findings")
    .eq("id", id)
    .single();
  if (error || !job) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (TERMINAL_STATUSES.has(job.status as string)) {
    return NextResponse.json({ ok: true, alreadyTerminal: true, status: job.status });
  }

  // 1. Best-effort: cancel the QStash workflow run so no more steps fire.
  if (job.workflow_run_id && process.env.QSTASH_TOKEN) {
    try {
      const wf = new WorkflowClient({ token: process.env.QSTASH_TOKEN });
      await wf.cancel({ ids: job.workflow_run_id as string });
    } catch (e) {
      // Continue — cancel may 404 if the run already finished.
      console.warn(`[research-hub/cancel] workflow cancel failed: ${(e as Error).message}`);
    }
  }

  // 2. Best-effort: cancel any in-flight Deep Research interactions we tracked.
  // findings is keyed by bucketId with { interactionId? } shape from start_research events.
  try {
    const { data: events } = await sb
      .from("research_job_events")
      .select("data")
      .eq("job_id", id)
      .eq("status", "progress");
    const interactionIds = new Set<string>();
    for (const e of (events ?? []) as Array<{ data: Record<string, unknown> | null }>) {
      const iid = e.data?.interactionId;
      if (typeof iid === "string") interactionIds.add(iid);
    }
    for (const iid of Array.from(interactionIds)) {
      try {
        await cancelDeepResearch(iid);
      } catch {
        // SDK may not expose cancel for finished interactions — ignore.
      }
    }
  } catch (e) {
    console.warn(`[research-hub/cancel] interaction cancel failed: ${(e as Error).message}`);
  }

  // 3. Mark the job cancelled + log an event.
  await sb
    .from("research_jobs")
    .update({
      status: "cancelled",
      finished_at: new Date().toISOString(),
      error: "cancelled by user",
    })
    .eq("id", id);

  await sb.from("research_job_events").insert({
    job_id: id,
    step: "workflow",
    status: "error",
    message: "המחקר בוטל ע״י המשתמש",
  });

  return NextResponse.json({ ok: true });
}
