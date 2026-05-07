"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/research-hub/ui/button";
import { Input, Textarea } from "@/components/research-hub/ui/input";
import { Card, CardContent } from "@/components/research-hub/ui/card";
import { Badge } from "@/components/research-hub/ui/badge";
import { AnglePicker } from "./AnglePicker";
import { allAngleIds, type AngleId } from "@/lib/research-hub/angles";
import { cn } from "@/lib/utils";
import { Sparkles, Telescope, Microscope } from "lucide-react";

const DEPTHS: {
  id: "express" | "standard" | "maximum";
  label: string;
  desc: string;
  cost: string;
  time: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    id: "express",
    label: "אקספרס",
    desc: "סקירת-על מהירה. דוח אחד מקיף.",
    cost: "$3-7",
    time: "~10 דק'",
    icon: Sparkles,
  },
  {
    id: "standard",
    label: "סטנדרט",
    desc: "מחקר עומק לפי 4 קבוצות זוויות במקביל.",
    cost: "$12-28",
    time: "~25 דק'",
    icon: Telescope,
  },
  {
    id: "maximum",
    label: "מקסימום",
    desc: "מחקר נפרד לכל זווית. עומק מקסימלי.",
    cost: "$35-80",
    time: "~50 דק'",
    icon: Microscope,
  },
];

export function NewResearchForm() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [brief, setBrief] = useState("");
  const [angles, setAngles] = useState<AngleId[]>(allAngleIds());
  const [depth, setDepth] = useState<"express" | "standard" | "maximum">("standard");
  const [pending, startTransition] = useTransition();

  function submit() {
    if (topic.trim().length < 3) {
      toast.error("נושא חייב להיות לפחות 3 תווים");
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/research-hub/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.trim(),
          brief: brief.trim() || undefined,
          angles,
          depth,
          language: "he",
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
                  <Badge variant={active ? "gold" : "muted"}>{d.cost}</Badge>
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
                    "text-[11px] mt-3 tracking-wider uppercase",
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
