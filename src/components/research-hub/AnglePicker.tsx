"use client";

import { ANGLES, allAngleIds, type AngleId } from "@/lib/research-hub/angles";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export function AnglePicker({
  value,
  onChange,
}: {
  value: AngleId[];
  onChange: (v: AngleId[]) => void;
}) {
  const all = allAngleIds();
  const allSelected = value.length === all.length;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-semibold text-brand-primary">זוויות מחקר</h3>
        <button
          type="button"
          onClick={() => onChange(allSelected ? [] : all)}
          className="text-[12px] text-brand-accent hover:underline"
        >
          {allSelected ? "נקה הכל" : "בחר הכל"}
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {ANGLES.map((a) => {
          const active = value.includes(a.id);
          return (
            <button
              key={a.id}
              type="button"
              onClick={() =>
                onChange(active ? value.filter((v) => v !== a.id) : [...value, a.id])
              }
              className={cn(
                "group relative text-right rounded-xl border px-4 py-3 transition-all",
                active
                  ? "border-brand-primary bg-brand-primary text-white shadow-wizard-md"
                  : "border-[rgb(var(--brand-mist))] bg-white hover:border-brand-secondary",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <div className="text-[14px] font-semibold">{a.label}</div>
                  <div
                    className={cn(
                      "text-[12px] mt-0.5",
                      active ? "text-white/70" : "text-muted-foreground",
                    )}
                  >
                    {a.description}
                  </div>
                </div>
                {active ? (
                  <Check className="size-4 shrink-0" />
                ) : (
                  <span className="size-4 rounded-full border border-[rgb(var(--brand-mist))] shrink-0 group-hover:border-brand-primary" />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
