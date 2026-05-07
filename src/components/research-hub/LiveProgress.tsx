"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/research-hub/ui/badge";
import { Progress } from "@/components/research-hub/ui/progress";
import { Button } from "@/components/research-hub/ui/button";
import { PlanView, type Plan } from "@/components/research-hub/PlanView";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  Circle,
  AlertCircle,
  Loader2,
  StopCircle,
  RefreshCw,
  Pencil,
} from "lucide-react";

type JobEvent = {
  id: number;
  job_id: string;
  step: string;
  status: "started" | "progress" | "done" | "error";
  message: string | null;
  data: Record<string, unknown> | null;
  created_at: string;
};

const STATUS_PCT: Record<string, number> = {
  queued: 2,
  planning: 8,
  researching: 50,
  synthesizing: 80,
  drafting: 88,
  rendering: 95,
  done: 100,
  failed: 100,
  cancelled: 100,
};

const TERMINAL = new Set(["done", "failed", "cancelled"]);

export function LiveProgress({
  jobId,
  initialStatus,
  initialEvents,
  initialPlan,
  rerunHref,
}: {
  jobId: string;
  initialStatus: string;
  initialEvents: JobEvent[];
  initialPlan: Plan | null;
  rerunHref: string;
}) {
  const [events, setEvents] = useState<JobEvent[]>(initialEvents);
  const [status, setStatus] = useState(initialStatus);
  const [plan, setPlan] = useState<Plan | null>(initialPlan);
  const [stopping, startStopping] = useTransition();
  const router = useRouter();

  useEffect(() => {
    const sb = createClient();
    const ch = sb
      .channel(`research_job:${jobId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "research_job_events",
          filter: `job_id=eq.${jobId}`,
        },
        ({ new: row }) => {
          setEvents((prev) => [...prev, row as JobEvent]);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "research_jobs",
          filter: `id=eq.${jobId}`,
        },
        ({ new: row }) => {
          const next = (row as { status: string; plan?: Plan | null }).status;
          const nextPlan = (row as { plan?: Plan | null }).plan;
          setStatus(next);
          if (nextPlan) setPlan(nextPlan);
          if (next === "done" || next === "cancelled" || next === "failed") {
            setTimeout(() => router.refresh(), 800);
          }
        },
      )
      .subscribe();
    return () => {
      sb.removeChannel(ch);
    };
  }, [jobId, router]);

  const pct = STATUS_PCT[status] ?? 5;
  const isTerminal = TERMINAL.has(status);
  const isCancelled = status === "cancelled";
  const isFailed = status === "failed";

  const groups = useMemo(() => groupEvents(events), [events]);

  function stop() {
    if (!confirm("לעצור את המחקר עכשיו? פעולות שכבר רצות ב-Deep Research ימשיכו עד שייגמרו אצל Google, אבל לא יישמרו לדוח.")) return;
    startStopping(async () => {
      const res = await fetch(`/api/research-hub/jobs/${jobId}/cancel`, { method: "POST" });
      if (res.ok) {
        toast.success("נשלחה בקשת עצירה");
        setStatus("cancelled");
      } else {
        const j = await res.json().catch(() => ({}));
        toast.error(j?.error ?? "שגיאה בעצירה");
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Action row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] tracking-[0.2em] uppercase text-muted-foreground font-rubik">
              {isCancelled ? "בוטל" : isFailed ? "נכשל" : isTerminal ? "הושלם" : "התקדמות"}
            </span>
            <span className="text-[12px] text-muted-foreground">{Math.round(pct)}%</span>
          </div>
          <Progress value={pct} />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isTerminal ? (
            <Button
              variant="outline"
              size="sm"
              onClick={stop}
              loading={stopping}
              disabled={stopping}
            >
              <StopCircle className="size-4 ms-1" />
              עצור
            </Button>
          ) : null}
          <Link href={rerunHref}>
            <Button variant={isTerminal ? "primary" : "ghost"} size="sm">
              {isTerminal ? <RefreshCw className="size-4 ms-1" /> : <Pencil className="size-4 ms-1" />}
              {isTerminal ? "חקור שוב עם שיפורים" : "ערוך והרץ מחדש"}
            </Button>
          </Link>
        </div>
      </div>

      {/* Plan view (visible the moment plan is ready) */}
      {plan ? <PlanView plan={plan} defaultOpen={!isTerminal} /> : null}

      {/* Step rows */}
      <div className="space-y-2">
        {groups.map((g) => (
          <StepRow key={g.step} group={g} />
        ))}
      </div>
    </div>
  );
}

type Group = {
  step: string;
  label: string;
  started: JobEvent;
  last: JobEvent;
  progress: JobEvent[];
  done?: JobEvent;
  error?: JobEvent;
};

function groupEvents(events: JobEvent[]): Group[] {
  const map = new Map<string, Group>();
  for (const e of events) {
    const g = map.get(e.step);
    if (!g) {
      map.set(e.step, { step: e.step, label: stepLabel(e.step), started: e, last: e, progress: [] });
    } else {
      g.last = e;
      if (e.status === "progress") g.progress.push(e);
      if (e.status === "done") g.done = e;
      if (e.status === "error") g.error = e;
    }
  }
  return Array.from(map.values());
}

function StepRow({ group }: { group: Group }) {
  const isError = !!group.error;
  const isDone = !!group.done;
  const isActive = !isDone && !isError;

  // Pull data hints: interaction id (from start_research progress), sources count + chars (from done)
  const interactionId = group.progress.find((p) => p.data && typeof (p.data as { interactionId?: string }).interactionId === "string")?.data?.interactionId as string | undefined;
  const doneData = group.done?.data as { sources?: number; chars?: number } | undefined;

  return (
    <div
      className={cn(
        "rounded-xl border bg-white p-4 transition-all",
        isError
          ? "border-rose-200 bg-rose-50/50"
          : isDone
            ? "border-emerald-200"
            : "border-[rgb(var(--brand-mist))]",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">
          {isError ? (
            <AlertCircle className="size-5 text-rose-500" />
          ) : isDone ? (
            <CheckCircle2 className="size-5 text-emerald-600" />
          ) : isActive ? (
            <Loader2 className="size-5 text-brand-accent animate-spin" />
          ) : (
            <Circle className="size-5 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-[14px] font-semibold text-brand-primary">{group.label}</h3>
            <div className="flex items-center gap-1.5">
              {isActive ? <Badge variant="accent">פעיל</Badge> : null}
              {doneData?.sources != null ? (
                <Badge variant="muted">{doneData.sources} מקורות</Badge>
              ) : null}
              {doneData?.chars != null ? (
                <Badge variant="muted">{Math.round(doneData.chars / 1000)}K תווים</Badge>
              ) : null}
            </div>
          </div>
          <p className="text-[13px] text-muted-foreground mt-0.5">{group.last.message ?? ""}</p>
          {interactionId ? (
            <p className="text-[10px] text-muted-foreground/70 mt-1 font-mono tracking-tight">
              interaction: {interactionId}
            </p>
          ) : null}
          {group.progress.length > 0 ? (
            <details className="mt-2">
              <summary className="text-[11px] text-muted-foreground cursor-pointer hover:text-brand-primary">
                {group.progress.length} עדכוני ביניים
              </summary>
              <ul className="mt-2 space-y-1 ps-4 border-s border-[rgb(var(--brand-mist))]">
                {group.progress.map((p) => (
                  <li key={p.id} className="text-[12px] text-muted-foreground">
                    {p.message}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function stepLabel(step: string) {
  if (step === "load_job") return "טוען job";
  if (step === "plan") return "תכנון מחקר";
  if (step.startsWith("research:")) {
    const id = step.slice("research:".length);
    if (id === "all") return "מחקר עומק מקיף";
    return `מחקר עומק — ${id}`;
  }
  if (step === "synthesize") return "סינתזה וכתיבה";
  if (step === "save_findings") return "שמירת ממצאים";
  if (step === "save_report") return "שמירת דוח";
  if (step === "pdf") return "ייצוא PDF";
  if (step === "finalize") return "סיום";
  if (step === "done") return "הושלם";
  if (step === "workflow") return "תהליך";
  return step;
}
