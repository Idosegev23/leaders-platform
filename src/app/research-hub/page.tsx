import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseService } from "@/lib/research-hub/service";
import { isDevMode, DEV_AUTH_USER } from "@/lib/auth/dev-mode";
import { NewResearchForm } from "@/components/research-hub/NewResearchForm";
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

export default async function ResearchHubHome() {
  let userEmail = DEV_AUTH_USER.email;
  let userId: string = DEV_AUTH_USER.id;
  if (!isDevMode) {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login?redirect=/research-hub");
    userEmail = user.email ?? "";
    userId = user.id;
  }

  // service-role read so dev-mode (no auth session) can still see jobs
  const service = createSupabaseService();
  const { data: recentJobs } = await service
    .from("research_jobs")
    .select("id, topic, status, depth, created_at, finished_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(8);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-[rgb(var(--brand-mist))] bg-brand-ivory/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-[13px] text-brand-primary hover:text-brand-accent transition">
            <ArrowRight className="size-4" />
            <span>חזרה ל-Hub</span>
          </Link>
          <div className="flex items-center gap-4 text-[13px] text-muted-foreground">
            <span className="hidden md:inline">{userEmail}</span>
            <Link href="/research-hub/jobs" className="text-brand-primary hover:text-brand-accent transition">
              היסטוריה
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-14">
        <div className="mb-10 text-center">
          <p className="text-[11px] tracking-[0.5em] uppercase text-muted-foreground font-rubik mb-3">
            Deep Research
          </p>
          <h1 className="font-cormorant italic text-4xl md:text-5xl text-brand-primary leading-tight">
            על מה נחקור היום?
          </h1>
          <p className="mt-3 text-[15px] text-muted-foreground max-w-md mx-auto leading-relaxed">
            תאר נושא — שוק, קטגוריה, מותג, מתחרה. המנוע יבנה תוכנית מחקר ויחזיר דוח אסטרטגי מלא.
          </p>
        </div>

        <Suspense fallback={<div className="text-muted-foreground text-[13px]">טוען טופס…</div>}>
          <NewResearchForm
            defaultNotifyEmail={
              userEmail && userEmail.includes("@") && !userEmail.endsWith("@docmaker.local")
                ? userEmail
                : null
            }
          />
        </Suspense>

        {recentJobs && recentJobs.length > 0 ? (
          <section className="mt-20">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[14px] font-semibold tracking-[0.2em] uppercase text-muted-foreground font-rubik">
                Recent Research
              </h2>
              <Link href="/research-hub/jobs" className="text-[13px] text-brand-accent hover:underline">
                כל ההיסטוריה ←
              </Link>
            </div>
            <div className="space-y-2">
              {recentJobs.map((j) => {
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
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
