"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/research-hub/ui/button";
import { Input, Textarea } from "@/components/research-hub/ui/input";
import { Card, CardContent } from "@/components/research-hub/ui/card";
import { Badge } from "@/components/research-hub/ui/badge";
import { AnglePicker } from "./AnglePicker";
import { ANGLES, defaultAngleIds, meetingPrepAngleIds, type AngleId } from "@/lib/research-hub/angles";
import { cn } from "@/lib/utils";
import { Sparkles, Telescope, Microscope, Atom, Lightbulb, Handshake, FlaskConical } from "lucide-react";

type Depth = "express" | "standard" | "maximum" | "ultra";
type Mode = "general" | "meeting_prep";

const ALL_IDS = new Set<string>(ANGLES.map((a) => a.id));
const VALID_DEPTH = new Set<Depth>(["express", "standard", "maximum", "ultra"]);

const DEPTHS: {
  id: Depth;
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
    desc: "מחקר רציני שמכסה את כל הזוויות בקבוצות מקבילות. ההמלצה לרוב הברייפים.",
    time: "~30 דק'",
    icon: Telescope,
  },
  {
    id: "maximum",
    label: "מקסימום",
    desc: "מחקר נפרד לכל זווית. כשצריך עומק שעומד בפני לקוח/מנכ״ל ומקור לכל מספר.",
    time: "~60 דק'",
    icon: Microscope,
  },
  {
    id: "ultra",
    label: "אולטרה",
    desc: "כל הזוויות + לולאת ביקורת אוטומטית שמשלימה פערים, דירוג מקורות, Stat Sheet, One-Pager לסמנכ״ל ועץ החלטה. הרמה הכבדה ביותר.",
    time: "~150 דק'",
    icon: Atom,
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

  const [mode, setMode] = useState<Mode>(() => {
    const raw = search?.get("mode");
    return raw === "meeting_prep" ? "meeting_prep" : "general";
  });
  const [topic, setTopic] = useState(search?.get("topic") ?? "");
  const [brandName, setBrandName] = useState(search?.get("brandName") ?? "");
  const [brandUrl, setBrandUrl] = useState(search?.get("brandUrl") ?? "");
  const [decisionToHelp, setDecisionToHelp] = useState(search?.get("decisionToHelp") ?? "");
  const [brief, setBrief] = useState(search?.get("brief") ?? "");
  const [refinement, setRefinement] = useState("");
  const [notifyEmail, setNotifyEmail] = useState(defaultNotifyEmail ?? "");
  const [depth, setDepth] = useState<Depth>(() => {
    const raw = search?.get("depth");
    return raw && VALID_DEPTH.has(raw as Depth) ? (raw as Depth) : "standard";
  });
  const [angles, setAngles] = useState<AngleId[]>(() => {
    const raw = search?.get("angles");
    if (!raw) return defaultAngleIds(depth);
    const parsed = raw.split(",").map((s) => s.trim()).filter((s) => ALL_IDS.has(s)) as AngleId[];
    return parsed.length ? parsed : defaultAngleIds(depth);
  });
  const [pending, startTransition] = useTransition();

  // When the user switches to ultra, auto-include the heavier angles
  // (unless they've manually customized the picker).
  useEffect(() => {
    if (depth === "ultra") {
      setAngles((prev) => {
        const set = new Set<AngleId>(prev);
        for (const a of ANGLES) set.add(a.id as AngleId);
        return Array.from(set);
      });
    }
  }, [depth]);

  // Switching to meeting-prep — preselect the BD-focused angles unless the
  // user already picked something custom via URL. Switching back to general
  // restores the depth-default.
  useEffect(() => {
    if (mode === "meeting_prep") {
      setAngles(meetingPrepAngleIds() as AngleId[]);
    } else {
      setAngles(defaultAngleIds(depth));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Surface a one-time toast when arriving from a previous job
  useEffect(() => {
    if (seedJobId) toast.message("הטופס מולא מתוך מחקר קודם — ערוך, חדד וחקור שוב.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedJobId]);

  function submit() {
    if (mode === "meeting_prep") {
      if (brandName.trim().length < 2) {
        toast.error("שם מותג חייב להיות לפחות 2 תווים");
        return;
      }
    } else {
      if (topic.trim().length < 3) {
        toast.error("נושא חייב להיות לפחות 3 תווים");
        return;
      }
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
          mode,
          topic: topic.trim() || undefined,
          brandName: brandName.trim() || undefined,
          brandUrl: brandUrl.trim() || undefined,
          decisionToHelp: decisionToHelp.trim() || undefined,
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

      {/* Mode selector — controls whether this is a free-form market research
          or a brand-centred meeting-prep run for the BD team. */}
      <div>
        <h3 className="text-[15px] font-semibold text-brand-primary mb-3">סוג מחקר</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {([
            {
              id: "general" as Mode,
              label: "מחקר שוק",
              desc: "מחקר חופשי — נושא, קטגוריה או החלטה אסטרטגית. כל הזוויות הזמינות.",
              icon: FlaskConical,
            },
            {
              id: "meeting_prep" as Mode,
              label: "הכנה לפגישה (BD)",
              desc: "מחקר ממוקד מותג לקראת פגישה. מכין Snapshot, Talking points ושאלות מומלצות, עם דגש על השוק הישראלי.",
              icon: Handshake,
            },
          ]).map((m) => {
            const Icon = m.icon;
            const active = mode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={cn(
                  "text-right rounded-2xl border p-5 transition-all",
                  active
                    ? "border-brand-primary bg-brand-primary text-white shadow-wizard-md"
                    : "border-[rgb(var(--brand-mist))] bg-white hover:border-brand-secondary",
                )}
              >
                <div className="flex items-center justify-between mb-3">
                  <Icon className={cn("size-5", active ? "text-brand-gold" : "text-brand-secondary")} />
                </div>
                <div className="text-[16px] font-semibold mb-1">{m.label}</div>
                <div
                  className={cn(
                    "text-[13px] leading-relaxed",
                    active ? "text-white/70" : "text-muted-foreground",
                  )}
                >
                  {m.desc}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-5">
          {mode === "meeting_prep" ? (
            <div>
              <label className="block text-[13px] font-medium text-brand-primary mb-2">
                שם המותג / החברה <span className="text-brand-gold">*</span>
              </label>
              <Input
                dir="auto"
                placeholder="לדוגמה: שטראוס, יוניליוור ישראל, סופר-פארם"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground mt-1.5">
                ניתן להשאיר את &quot;נושא המחקר&quot; ריק — אנחנו נגזור אותו אוטומטית משם המותג.
              </p>
            </div>
          ) : null}

          <div>
            <label className="block text-[13px] font-medium text-brand-primary mb-2">
              {mode === "meeting_prep" ? (
                <>נושא המחקר <span className="text-muted-foreground font-normal">— אופציונלי, ייגזר משם המותג אם ריק</span></>
              ) : (
                "נושא המחקר"
              )}
            </label>
            <Input
              dir="auto"
              placeholder={
                mode === "meeting_prep"
                  ? "לדוגמה: זווית קמפיין משפיענים לקראת השקת מוצר חדש"
                  : "לדוגמה: שוק הקיטו בישראל; מותגי ייעוץ נדל״ן בארה״ב; קטגוריית פיתות פרימיום"
              }
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-[13px] font-medium text-brand-primary mb-2">
              אתר / דומיין המותג{" "}
              <span className="text-muted-foreground font-normal">
                {mode === "meeting_prep"
                  ? "— מומלץ מאוד; בלי אתר אנחנו נסתמך על מקורות ציבוריים בלבד"
                  : "— אופציונלי, אבל מומלץ מאוד אם המחקר ממוקד מותג ספציפי"}
              </span>
            </label>
            <Input
              dir="ltr"
              placeholder="https://example.com"
              value={brandUrl}
              onChange={(e) => setBrandUrl(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground mt-1.5">
              כשמסופק, הזוויות &quot;ניתוח מותג מעמיק&quot; ו&quot;רעיונות למותג&quot; חוקרות ישירות את האתר — קטלוג, מחירים, About, אזכורים ציבוריים.
            </p>
          </div>

          <div>
            <label className="block text-[13px] font-medium text-brand-primary mb-2">
              ההחלטה האחת שהמחקר אמור לעזור לקבל{" "}
              <span className="text-muted-foreground font-normal">
                — אופציונלי, חובה ב-אולטרה
              </span>
            </label>
            <Textarea
              dir="auto"
              placeholder="לדוגמה: האם להיכנס לקטגוריית פיתות פרימיום ב-2026? איזה SKU לקצץ מהקטלוג? איזה מתחרה לרכוש?"
              value={decisionToHelp}
              onChange={(e) => setDecisionToHelp(e.target.value)}
              className="min-h-[80px]"
            />
            <p className="text-[11px] text-muted-foreground mt-1.5">
              כשמסופק, ה-Planner, הביקורת ו-One-Pager מתיישרים על ההחלטה הזו במקום לתת דוח גנרי.
            </p>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {DEPTHS.map((d) => {
            const Icon = d.icon;
            const active = depth === d.id;
            const isUltra = d.id === "ultra";
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setDepth(d.id)}
                className={cn(
                  "text-right rounded-2xl border p-5 transition-all relative",
                  active
                    ? "border-brand-primary bg-brand-primary text-white shadow-wizard-md"
                    : isUltra
                      ? "border-brand-gold/50 bg-gradient-to-br from-brand-gold-light/30 to-white hover:border-brand-gold"
                      : "border-[rgb(var(--brand-mist))] bg-white hover:border-brand-secondary",
                )}
              >
                {isUltra && !active ? (
                  <span className="absolute top-2 left-2 text-[9px] tracking-widest uppercase text-brand-gold font-semibold">
                    NEW
                  </span>
                ) : null}
                <div className="flex items-center justify-between mb-3">
                  <Icon className={cn("size-5", active ? "text-brand-gold" : isUltra ? "text-brand-gold" : "text-brand-secondary")} />
                  <Badge variant={active ? "gold" : isUltra ? "gold" : "muted"}>{d.time}</Badge>
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
          {angles.length === ANGLES.length ? "כל הזוויות" : `${angles.length} זוויות`}
        </span>
        <Button onClick={submit} loading={pending} size="xl" disabled={pending}>
          התחל מחקר ←
        </Button>
      </div>
    </div>
  );
}
