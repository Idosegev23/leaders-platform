import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = "text", ...rest }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "h-12 w-full rounded-xl border border-[rgb(var(--brand-mist))] bg-white px-4 text-[15px] placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--ring))]/40 focus-visible:border-[rgb(var(--ring))] transition-all",
        className,
      )}
      {...rest}
    />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...rest }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "min-h-[120px] w-full rounded-xl border border-[rgb(var(--brand-mist))] bg-white p-4 text-[15px] leading-relaxed placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--ring))]/40 focus-visible:border-[rgb(var(--ring))] transition-all resize-y",
      className,
    )}
    {...rest}
  />
));
Textarea.displayName = "Textarea";
