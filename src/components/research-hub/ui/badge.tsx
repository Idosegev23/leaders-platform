import * as React from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "muted" | "accent" | "gold" | "success" | "warn" | "outline";

const VARIANT: Record<BadgeVariant, string> = {
  default: "bg-brand-primary text-white",
  muted: "bg-brand-pearl text-brand-primary",
  accent: "bg-brand-accent text-white",
  gold: "bg-brand-gold-light text-brand-gold",
  success: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  warn: "bg-amber-50 text-amber-800 border border-amber-200",
  outline: "border border-[rgb(var(--brand-mist))] text-brand-primary",
};

export function Badge({
  className,
  variant = "default",
  ...rest
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-3 py-1 text-[12px] font-medium tracking-tight",
        VARIANT[variant],
        className,
      )}
      {...rest}
    />
  );
}
