"use client";

import { useState } from "react";
import { ChevronDown, ChevronLeft, MapPin, Target, ListChecks } from "lucide-react";
import { ANGLES, type AngleId } from "@/lib/research-hub/angles";
import { cn } from "@/lib/utils";

export type Plan = {
  title: string;
  executive_intent: string;
  geography?: string;
  language?: string;
  sub_questions: { angle: AngleId; questions: string[] }[];
  must_know_facts?: string[];
};

const ANGLE_LABEL: Record<string, string> = Object.fromEntries(
  ANGLES.map((a) => [a.id, a.label]),
);

export function PlanView({ plan, defaultOpen = true }: { plan: Plan; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const totalQuestions = plan.sub_questions.reduce((s, sq) => s + sq.questions.length, 0);

  return (
    <section className="rounded-2xl border border-[rgb(var(--brand-mist))] bg-white shadow-wizard-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-right p-5 flex items-start justify-between gap-4 hover:bg-brand-pearl/30 transition"
      >
        <div className="flex-1 min-w-0">
          <p className="text-[10px] tracking-[0.4em] uppercase text-brand-accent font-rubik mb-2 font-medium">
            Plan · תוכנית מחקר
          </p>
          <h3 className="font-cormorant italic text-2xl text-brand-primary leading-tight">
            {plan.title}
          </h3>
          {plan.executive_intent ? (
            <p className="mt-2 text-[13px] text-muted-foreground leading-relaxed">
              {plan.executive_intent}
            </p>
          ) : null}
          <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
            {plan.geography ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" />
                {plan.geography}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1">
              <Target className="size-3" />
              {plan.sub_questions.length} זוויות
            </span>
            <span className="inline-flex items-center gap-1">
              <ListChecks className="size-3" />
              {totalQuestions} שאלות
            </span>
          </div>
        </div>
        <span className="shrink-0 text-brand-primary/40 mt-1">
          {open ? <ChevronDown className="size-4" /> : <ChevronLeft className="size-4" />}
        </span>
      </button>

      {open ? (
        <div className="px-5 pb-5 space-y-5">
          {plan.must_know_facts?.length ? (
            <div>
              <h4 className="text-[11px] tracking-[0.2em] uppercase text-muted-foreground font-rubik mb-2">
                Must-know facts
              </h4>
              <ul className="space-y-1.5">
                {plan.must_know_facts.map((f, i) => (
                  <li key={i} className="flex gap-2 text-[13px] leading-relaxed">
                    <span className="mt-1.5 size-1 rounded-full bg-brand-gold shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div>
            <h4 className="text-[11px] tracking-[0.2em] uppercase text-muted-foreground font-rubik mb-2">
              שאלות מחקר לפי זווית
            </h4>
            <ul className="space-y-2">
              {plan.sub_questions.map((sq, i) => (
                <AngleQuestions
                  key={i}
                  label={ANGLE_LABEL[sq.angle as string] ?? (sq.angle as string)}
                  questions={sq.questions}
                />
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function AngleQuestions({ label, questions }: { label: string; questions: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-xl border border-[rgb(var(--brand-mist))] bg-brand-pearl/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-full text-right px-4 py-3 flex items-center justify-between gap-3 transition",
          open ? "bg-brand-pearl/40" : "hover:bg-brand-pearl/30",
        )}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-[14px] font-semibold text-brand-primary truncate">{label}</span>
          <span className="text-[11px] text-muted-foreground shrink-0">
            {questions.length} שאלות
          </span>
        </div>
        <span className="shrink-0 text-brand-primary/40">
          {open ? <ChevronDown className="size-3.5" /> : <ChevronLeft className="size-3.5" />}
        </span>
      </button>
      {open ? (
        <ol className="px-4 pb-3 pt-1 space-y-1.5">
          {questions.map((q, j) => (
            <li key={j} className="flex gap-2 text-[13px] leading-relaxed text-brand-primary/85">
              <span className="numeral text-brand-accent shrink-0">{j + 1}.</span>
              <span>{q}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </li>
  );
}
