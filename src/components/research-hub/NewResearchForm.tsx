"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/research-hub/ui/button";
import { Input, Textarea } from "@/components/research-hub/ui/input";
import { Card, CardContent } from "@/components/research-hub/ui/card";
import { Badge } from "@/components/research-hub/ui/badge";
import { AnglePicker } from "./AnglePicker";
import { allAngleIds, ANGLES, type AngleId } from "@/lib/research-hub/angles";
import { cn } from "@/lib/utils";
import { Sparkles, Telescope, Microscope, Lightbulb } from "lucide-react";

const ALL_IDS = new Set<string>(ANGLES.map((a) => a.id));
const VALID_DEPTH = new Set(["express", "standard", "maximum"]);

const DEPTHS: {
  id: "express" | "standard" | "maximum";
  label: string;
  desc: string;
  time: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    id: "express",
    label: "אקספרס",
    desc: "סקירת-על מהירה לקבלת ההקשר העיקרי. מתאים להחלטות זריזות וראייה ראשונית.",
    time: "~10 דק'",
    icon: Sparkles,
  },
  {
    id: "standard",
    label: "סטנדרט",
    desc: "מחקר רציני שמכסה את כל הזוויות ב-4 קבוצות מקבילות. ההמלצה לרוב הברייפים.",
    time: "~25 דק'",
    icon: Telescope,
  },
  {
    id: "maximum",
    label: "מקסימום",
    desc: "מחקר נפרד לכל זווית. כשצריך עומק שעומד בפני לקוח/מנכ״ל ומקור לכל מספר.",
    time: "~50 דק'",
    icon: Microscope,
  },
];

export function NewResearchForm({
  defaultNotifyEmail,
}: {
  defaultNotifyEmail?: string | null;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const seedJobId = search?.get("seed") ?? null;

  const [topic, setTopic] = useState(search?.get("topic") ?? "");
  const [brief, setBrief] = useState(search?.get("brief") ?? "");
  const [refinement, setRefinement] = useState("");
  const [notifyEmail, setNotifyEmail] = useState(defaultNotifyEmail ?? "");
  const [angles, setAngles] = useState<AngleId[]>(() => {
    const raw = search?.get("angles");
    if (!raw) return allAngleIds();
    const parsed = raw.split(",").map((s) => s.trim()).filter((s) => ALL_IDS.has(s)) as AngleId[];
    return parsed.length ? parsed : allAngleIds();
  });
  const [depth, setDepth] = useState<"express" | "standard" | "maximum">(() => {
    const raw = search?.get("depth");
    return raw && VALID_DEPTH.has(raw) ? (raw as "express" | "standard" | "maximum") : "standard";
  });
  const [pending, startTransition] = useTransition();

  // Surface a one-time toast when arriving from a previous job
  useEffect(() => {
    if (seedJobId) toast.message("הטופס מולא מתוך מחקר קודם — ערוך, חדד וחקור שוב.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedJobId]);

  function submit() {
    if (topic.trim().length < 3) {
      toast.error("נושא חייב להיות לפחות 3 תווים");
      return;
    }
    // If user entered refinement notes, append them to the brief so the
    // planner sees them. Keep them clearly labelled so it's obvious what's
    // an old brief vs. a refinement note.
    const composedBrief = (() => {
      const b = brief.trim();
      const r = refinement.trim();
      if (!r) return b || undefined;
      const tag = seedJobId ? "שיפורים מהמחקר הקודם" : "הערות חידוד";
      return [b, b ? "" : null, `--- ${tag} ---`, r].filter((x) => x !== null).join("\n");
    })();

    startTransition(async () => {
      const res = await fetch("/api/research-hub/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.trim(),
          brief: composedBrief,
          angles,
          depth,
          language: "he",
          notifyEmail: notifyEmail.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.detail ?? data?.error ?? "שגיאה");
        return;
      }
      if (data?.warning) toast.warning(data.warning);
      else toast.success("המחקר התחיל");
      router.push(`/research-hub/jobs/${data.jobId}`);
    });
  }

  return (
    <div className="space-y-8">
      {seedJobId ? (
        <div className="rounded-2xl border border-brand-gold/30 bg-brand-gold-light/40 p-4 flex items-start gap-3">
          <Lightbulb className="size-5 text-brand-gold shrink-0 mt-0.5" />
          <div className="flex-1 text-[13px] leading-relaxed">
            <p className="font-semibold text-brand-primary mb-1">
              חקירה מחדש על בסיס מחקר קודם
            </p>
            <p className="text-muted-foreground">
              הנושא, הברייף, הזוויות והעומק הועתקו אוטומטית. ערוך כל שדה לפי הצורך, או הוסף הוראות חידוד למטה.
            </p>
          </div>
        </div>
      ) : null}

      <Card>
        <CardContent className="pt-6 space-y-5">
          <div>
            <label className="block text-[13px] font-medium text-brand-primary mb-2">
              נושא המחקר
            </label>
            <Input
              dir="auto"
              placeholder="לדוגמה: שוק הקיטו בישראל; מותגי ייעוץ נדל״ן בארה״ב; קטגוריית פיתות פרימיום"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-[13px] font-medium text-brand-primary mb-2">
              ברייף נוסף <span className="text-muted-foreground font-normal">(אופציונלי)</span>
            </label>
            <Textarea
              dir="auto"
              placeholder="הקשר עסקי, שאלות ספציפיות, הנחות יסוד, גאוגרפיה ספציפית, התאמות ללקוח..."
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
            />
          </div>

          {seedJobId ? (
            <div>
              <label className="block text-[13px] font-medium text-brand-primary mb-2">
                שיפורים למחקר{" "}
                <span className="text-muted-foreground font-normal">
                  — מה לחקור עמוק יותר, מה החסר היה במחקר הקודם
                </span>
              </label>
              <Textarea
                dir="auto"
                placeholder="לדוגמה: התעמק יותר בתמחור פרימיום, הוסף ניתוח מתחרות מיפן, החסר היה ניתוח של דור Z..."
                value={refinement}
                onChange={(e) => setRefinement(e.target.value)}
                className="min-h-[100px] border-brand-gold/40 bg-brand-gold-light/20 focus-visible:border-brand-gold"
              />
            </div>
          ) : null}

          <div>
            <label className="block text-[13px] font-medium text-brand-primary mb-2">
              שלחו לי מייל כשהדוח מוכן{" "}
              <span className="text-muted-foreground font-normal">
                — אפשר לסגור את החלון ולחזור
              </span>
            </label>
            <Input
              dir="ltr"
              type="email"
              placeholder="name@example.com"
              value={notifyEmail}
              onChange={(e) => setNotifyEmail(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground mt-1.5">
              ברירת מחדל: המייל שאיתו התחברת. המחקר רץ ברקע ב-QStash גם אם תסגרי את הדפדפן.
            </p>
          </div>
        </CardContent>
      </Card>

      <div>
        <h3 className="text-[15px] font-semibold text-brand-primary mb-3">עומק המחקר</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {DEPTHS.map((d) => {
            const Icon = d.icon;
            const active = depth === d.id;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setDepth(d.id)}
                className={cn(
                  "text-right rounded-2xl border p-5 transition-all",
                  active
                    ? "border-brand-primary bg-brand-primary text-white shadow-wizard-md"
                    : "border-[rgb(var(--brand-mist))] bg-white hover:border-brand-secondary",
                )}
              >
                <div className="flex items-center justify-between mb-3">
                  <Icon className={cn("size-5", active ? "text-brand-gold" : "text-brand-secondary")} />
                  <Badge variant={active ? "gold" : "muted"}>{d.time}</Badge>
                </div>
                <div className="text-[16px] font-semibold mb-1">{d.label}</div>
                <div
                  className={cn(
                    "text-[13px] leading-relaxed",
                    active ? "text-white/70" : "text-muted-foreground",
                  )}
                >
                  {d.desc}
                </div>
                <div
                  className={cn(
                    "text-[11px] mt-3 tracking-wider uppercase opacity-0",
                    active ? "text-white/50" : "text-muted-foreground",
                  )}
                >
                  {d.time}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <AnglePicker value={angles} onChange={setAngles} />
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <span className="text-[13px] text-muted-foreground">
          {angles.length === allAngleIds().length ? "כל הזוויות" : `${angles.length} זוויות`}
        </span>
        <Button onClick={submit} loading={pending} size="xl" disabled={pending}>
          התחל מחקר ←
        </Button>
      </div>
    </div>
  );
}
