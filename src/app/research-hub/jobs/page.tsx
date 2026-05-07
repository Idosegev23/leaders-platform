import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseService } from "@/lib/research-hub/service";
import { isDevMode, DEV_AUTH_USER } from "@/lib/auth/dev-mode";
import { Badge } from "@/components/research-hub/ui/badge";
import { timeAgoHe } from "@/lib/research-hub/utils";
import { ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, { label: string; variant: "muted" | "accent" | "success" | "warn" }> = {
  queued: { label: "בתור", variant: "muted" },
  planning: { label: "מתכנן", variant: "accent" },
  researching: { label: "חוקר", variant: "accent" },
  synthesizing: { label: "מסנתז", variant: "accent" },
  drafting: { label: "כותב", variant: "accent" },
  rendering: { label: "מרנדר", variant: "accent" },
  done: { label: "הושלם", variant: "success" },
  failed: { label: "נכשל", variant: "warn" },
  cancelled: { label: "בוטל", variant: "muted" },
};

export default async function JobsPage() {
  let userId: string = DEV_AUTH_USER.id;
  if (!isDevMode) {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login?redirect=/research-hub/jobs");
    userId = user.id;
  }

  const service = createSupabaseService();
  const { data: jobs } = await service
    .from("research_jobs")
    .select("id, topic, status, depth, created_at, finished_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-[rgb(var(--brand-mist))] bg-brand-ivory/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
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

      <main className="max-w-5xl mx-auto px-6 py-10">
        <h1 className="font-cormorant italic text-3xl text-brand-primary mb-6">היסטוריית מחקרים</h1>
        <div className="space-y-2">
          {(jobs ?? []).map((j) => {
            const s = STATUS_LABEL[j.status as string] ?? STATUS_LABEL.queued;
            return (
              <Link
                key={j.id as string}
                href={`/research-hub/jobs/${j.id}`}
                className="block rounded-xl border border-[rgb(var(--brand-mist))] bg-white px-5 py-4 hover:border-brand-secondary hover:shadow-wizard-sm transition-all"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-medium text-brand-primary truncate">
                      {j.topic as string}
                    </div>
                    <div className="text-[12px] text-muted-foreground mt-0.5">
                      {timeAgoHe(j.created_at as string)} · {j.depth as string}
                    </div>
                  </div>
                  <Badge variant={s.variant}>{s.label}</Badge>
                </div>
              </Link>
            );
          })}
          {!jobs?.length ? (
            <div className="text-center py-14 text-muted-foreground text-[14px]">
              עוד אין מחקרים.{" "}
              <Link href="/research-hub" className="text-brand-accent hover:underline">
                להתחיל
              </Link>
              .
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
