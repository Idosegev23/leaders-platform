import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient as createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseService } from "@/lib/research-hub/service";
import { isDevMode } from "@/lib/auth/dev-mode";
import { LiveProgress } from "@/components/research-hub/LiveProgress";
import type { Plan } from "@/components/research-hub/PlanView";
import { Badge } from "@/components/research-hub/ui/badge";
import { ArrowRight, FileText, Download } from "lucide-react";
import { Button } from "@/components/research-hub/ui/button";
import { timeAgoHe } from "@/lib/research-hub/utils";

export const dynamic = "force-dynamic";

export default async function JobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isDevMode) {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect(`/login?redirect=/research-hub/jobs/${id}`);
  }

  const service = createSupabaseService();
  const { data: job } = await service
    .from("research_jobs")
    .select("*")
    .eq("id", id)
    .single();
  if (!job) notFound();

  const { data: events } = await service
    .from("research_job_events")
    .select("*")
    .eq("job_id", id)
    .order("id", { ascending: true });

  const { data: report } = await service
    .from("research_reports")
    .select("id")
    .eq("job_id", id)
    .maybeSingle();

  const isDone = job.status === "done";
  const isFailed = job.status === "failed";
  const isCancelled = job.status === "cancelled";

  // Build a "rerun with refinements" URL — pre-fills the new-research form
  // with this job's topic / brief / depth / angles and a seed reference.
  const rerunParams = new URLSearchParams();
  rerunParams.set("seed", id);
  if (job.topic) rerunParams.set("topic", job.topic as string);
  if (job.brief) rerunParams.set("brief", job.brief as string);
  if (job.depth) rerunParams.set("depth", job.depth as string);
  if (Array.isArray(job.angles) && job.angles.length) {
    rerunParams.set("angles", (job.angles as string[]).join(","));
  }
  const rerunHref = `/research-hub?${rerunParams.toString()}`;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-[rgb(var(--brand-mist))] bg-brand-ivory/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link
            href="/research-hub"
            className="inline-flex items-center gap-1 text-[13px] text-brand-primary hover:text-brand-accent transition"
          >
            <ArrowRight className="size-4" />
            <span>חדש</span>
          </Link>
          <Link
            href="/dashboard"
            className="text-[13px] text-muted-foreground hover:text-brand-primary transition"
          >
            ל-Hub
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="mb-8">
          <p className="text-[11px] tracking-[0.4em] uppercase text-muted-foreground font-rubik mb-2">
            {timeAgoHe(job.created_at as string)} · {job.depth as string}
          </p>
          <h1 className="font-cormorant italic text-3xl md:text-4xl text-brand-primary leading-tight">
            {job.topic as string}
          </h1>
          {job.brief ? (
            <p className="mt-3 text-[14px] text-muted-foreground leading-relaxed max-w-2xl">
              {job.brief as string}
            </p>
          ) : null}
        </div>

        {isDone && report ? (
          <div className="mb-8 rounded-2xl bg-brand-primary text-white p-6 shadow-wizard-md flex items-center justify-between gap-4">
            <div>
              <Badge variant="gold" className="mb-2">הדוח מוכן</Badge>
              <h2 className="font-cormorant italic text-2xl">דוח אסטרטגי מלא נכתב</h2>
              <p className="text-white/70 text-[13px] mt-1">
                לחץ לצפייה בדוח, להורדה כ-PDF או לשיתוף.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Link href={`/research-hub/reports/${report.id}`}>
                <Button variant="dark" size="md">
                  <FileText className="size-4 ms-2" />
                  פתח דוח
                </Button>
              </Link>
              {job.pdf_path ? (
                <Link href={`/api/research-hub/pdf/${id}/download`}>
                  <Button variant="ghost" size="sm" className="text-white hover:bg-white/10">
                    <Download className="size-4 ms-2" />
                    הורד PDF
                  </Button>
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}

        {isFailed ? (
          <div className="mb-8 rounded-2xl border border-rose-200 bg-rose-50 p-5">
            <h3 className="text-rose-900 font-semibold mb-1">המחקר נכשל</h3>
            <p className="text-[13px] text-rose-800">{(job.error as string) ?? "שגיאה לא ידועה"}</p>
          </div>
        ) : null}

        {isCancelled ? (
          <div className="mb-8 rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <h3 className="text-amber-900 font-semibold mb-1">המחקר בוטל</h3>
            <p className="text-[13px] text-amber-800">
              ניתן לפתוח מחדש עם שיפורים — הזוויות והברייף יישמרו אוטומטית.
            </p>
          </div>
        ) : null}

        <LiveProgress
          jobId={id}
          initialStatus={job.status as string}
          initialEvents={(events ?? []) as never[]}
          initialPlan={(job.plan as Plan | null) ?? null}
          rerunHref={rerunHref}
        />
      </main>
    </div>
  );
}
