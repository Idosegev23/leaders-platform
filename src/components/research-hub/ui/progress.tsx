import { cn } from "@/lib/utils";

export function Progress({
  value,
  className,
  showValue = false,
}: {
  value: number;
  className?: string;
  showValue?: boolean;
}) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("relative h-2 w-full overflow-hidden rounded-full bg-brand-mist", className)}>
      <div
        className="h-full rounded-full bg-gradient-to-l from-brand-accent via-brand-secondary to-brand-primary transition-[width] duration-500 ease-out"
        style={{ width: `${v}%` }}
      />
      {showValue ? (
        <span className="absolute end-2 top-1/2 -translate-y-1/2 text-[10px] font-medium text-brand-primary">
          {Math.round(v)}%
        </span>
      ) : null}
    </div>
  );
}
