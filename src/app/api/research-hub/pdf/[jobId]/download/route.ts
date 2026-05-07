import { NextResponse } from "next/server";
import { createClient as createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseService } from "@/lib/research-hub/service";
import { isDevMode } from "@/lib/auth/dev-mode";

const BUCKET = "research-reports";

export async function GET(_req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await ctx.params;

  if (!isDevMode) {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const service = createSupabaseService();
  const { data: job } = await service
    .from("research_jobs")
    .select("id, user_id, pdf_path, topic")
    .eq("id", jobId)
    .single();
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!job.pdf_path) return NextResponse.json({ error: "pdf not ready" }, { status: 404 });

  const { data: blob, error } = await service.storage
    .from(BUCKET)
    .download(job.pdf_path as string);
  if (error || !blob) return NextResponse.json({ error: error?.message ?? "download failed" }, { status: 500 });

  const buf = Buffer.from(await blob.arrayBuffer());
  // Strip filesystem-unsafe chars; encodeURIComponent on the wire handles unicode safely.
  const filename = `${(job.topic as string).replace(/[\\/:*?"<>|]/g, "").slice(0, 60)}.pdf`;
  return new NextResponse(buf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
