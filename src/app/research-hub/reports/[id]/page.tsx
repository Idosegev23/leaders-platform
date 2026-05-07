import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient as createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseService } from "@/lib/research-hub/service";
import { isDevMode } from "@/lib/auth/dev-mode";
import { ReportView } from "@/components/research-hub/ReportView";
import { Button } from "@/components/research-hub/ui/button";
import { Download, ArrowRight, Share2 } from "lucide-react";
import type { Report } from "@/lib/research-hub/prompts/synthesizer";

export const dynamic = "force-dynamic";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!isDevMode) {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect(`/login?redirect=/research-hub/reports/${id}`);
  }

  const service = createSupabaseService();
  const { data: rep } = await service
    .from("research_reports")
    .select("*")
    .eq("id", id)
    .single();
  if (!rep) notFound();

  const report = rep.sections as Report;
  const sources = (rep.sources ?? []) as { url: string; title?: string }[];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-[rgb(var(--brand-mist))] bg-brand-ivory/80 backdrop-blur sticky top-0 z-30 print:hidden">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link
            href={`/research-hub/jobs/${rep.job_id}`}
            className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-brand-primary transition"
          >
            <ArrowRight className="size-4" />
            <span>חזרה ל-job</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link href={`/api/research-hub/pdf/${rep.job_id}/download`}>
              <Button variant="outline" size="sm">
                <Download className="size-4 ms-2" />
                PDF
              </Button>
            </Link>
            <form
              action={async () => {
                "use server";
                const sb = createSupabaseService();
                const token = (rep.shared_token as string) ?? crypto.randomUUID();
                await sb
                  .from("research_reports")
                  .update({ shared_token: token })
                  .eq("id", id);
              }}
            >
              <Button type="submit" variant="ghost" size="sm">
                <Share2 className="size-4 ms-2" />
                שתף
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <ReportView report={report} sources={sources} />
      </main>

      <style>{`
        .prose-content { font-family: var(--font-heebo), system-ui, sans-serif; }
      `}</style>
    </div>
  );
}
