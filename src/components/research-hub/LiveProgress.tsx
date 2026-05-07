"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/research-hub/ui/badge";
import { Progress } from "@/components/research-hub/ui/progress";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, AlertCircle, Loader2 } from "lucide-react";

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

export function LiveProgress({
  jobId,
  initialStatus,
  initialEvents,
}: {
  jobId: string;
  initialStatus: string;
  initialEvents: JobEvent[];
}) {
  const [events, setEvents] = useState<JobEvent[]>(initialEvents);
  const [status, setStatus] = useState(initialStatus);
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
          const next = (row as { status: string }).status;
          setStatus(next);
          if (next === "done") {
            setTimeout(() => router.refresh(), 1000);
          }
        },
      )
      .subscribe();
    return () => {
      sb.removeChannel(ch);
    };
  }, [jobId, router]);

  const pct = STATUS_PCT[status] ?? 5;

  type Group = {
    step: string;
    label: string;
    started: JobEvent;
    last: JobEvent;
    progress: JobEvent[];
    done?: JobEvent;
    error?: JobEvent;
  };
  const groups = new Map<string, Group>();
  for (const e of events) {
    const g = groups.get(e.step);
    if (!g) {
      groups.set(e.step, {
        step: e.step,
        label: stepLabel(e.step),
        started: e,
        last: e,
        progress: [],
      });
    } else {
      g.last = e;
      if (e.status === "progress") g.progress.push(e);
      if (e.status === "done") g.done = e;
      if (e.status === "error") g.error = e;
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[12px] tracking-[0.2em] uppercase text-muted-foreground font-rubik">
            התקדמות
          </span>
          <span className="text-[12px] text-muted-foreground">{Math.round(pct)}%</span>
        </div>
        <Progress value={pct} />
      </div>

      <div className="space-y-2">
        {Array.from(groups.values()).map((g) => (
          <StepRow key={g.step} group={g} />
        ))}
      </div>
    </div>
  );
}

function StepRow({
  group,
}: {
  group: {
    step: string;
    label: string;
    started: JobEvent;
    last: JobEvent;
    progress: JobEvent[];
    done?: JobEvent;
    error?: JobEvent;
  };
}) {
  const isError = !!group.error;
  const isDone = !!group.done;
  const isActive = !isDone && !isError;

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
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[14px] font-semibold text-brand-primary">{group.label}</h3>
            {isActive ? <Badge variant="accent">פעיל</Badge> : null}
          </div>
          <p className="text-[13px] text-muted-foreground mt-0.5">{group.last.message ?? ""}</p>
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
  if (step === "pdf") return "ייצוא PDF";
  if (step === "done") return "הושלם";
  if (step === "workflow") return "תהליך";
  return step;
}
