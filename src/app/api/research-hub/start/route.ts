import { NextResponse } from "next/server";
import { z } from "zod";
import { Client as WorkflowClient } from "@upstash/workflow";
import { createClient as createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseService } from "@/lib/research-hub/service";
import { allAngleIds } from "@/lib/research-hub/angles";
import { isDevMode, DEV_AUTH_USER } from "@/lib/auth/dev-mode";

const Body = z.object({
  topic: z.string().min(3).max(500),
  brief: z.string().max(4000).optional(),
  angles: z.array(z.string()).optional(),
  depth: z.enum(["express", "standard", "maximum"]).default("standard"),
  language: z.enum(["he", "en"]).default("he"),
});

export async function POST(req: Request) {
  // 1. Auth — same pattern as the rest of the hub: dev-mode bypass otherwise Supabase user
  let userId: string;
  if (isDevMode) {
    userId = DEV_AUTH_USER.id;
  } else {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    userId = user.id;
  }

  // 2. Validate
  let payload: z.infer<typeof Body>;
  try {
    payload = Body.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: "invalid payload", detail: (e as Error).message },
      { status: 400 },
    );
  }

  const angles = payload.angles?.length ? payload.angles : allAngleIds();

  // 3. Insert job (service role bypasses RLS but we keep user_id correct)
  const service = createSupabaseService();
  const { data: job, error: jobErr } = await service
    .from("research_jobs")
    .insert({
      user_id: userId,
      topic: payload.topic,
      brief: payload.brief,
      angles,
      depth: payload.depth,
      language: payload.language,
      status: "queued",
    })
    .select("id")
    .single();
  if (jobErr || !job) {
    return NextResponse.json({ error: "db", detail: jobErr?.message }, { status: 500 });
  }

  // 4. Kick off Upstash Workflow
  if (!process.env.QSTASH_TOKEN) {
    return NextResponse.json(
      { jobId: job.id, warning: "QSTASH_TOKEN missing — workflow not started" },
      { status: 200 },
    );
  }

  const appUrl = process.env.APP_URL || new URL(req.url).origin;
  const wf = new WorkflowClient({ token: process.env.QSTASH_TOKEN });
  try {
    const { workflowRunId } = await wf.trigger({
      url: `${appUrl}/api/research-hub/workflow`,
      body: { jobId: job.id as string },
      retries: 2,
      headers: { "Upstash-Deduplication-Id": `research-hub:${job.id}` },
    });
    await service
      .from("research_jobs")
      .update({
        workflow_run_id: workflowRunId,
        status: "planning",
        started_at: new Date().toISOString(),
      })
      .eq("id", job.id);
  } catch (e) {
    await service
      .from("research_jobs")
      .update({ status: "failed", error: (e as Error).message })
      .eq("id", job.id);
    return NextResponse.json({ error: "workflow", detail: (e as Error).message }, { status: 500 });
  }

  return NextResponse.json({ jobId: job.id });
}
