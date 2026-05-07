import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "accent" | "dark";
type Size = "sm" | "md" | "lg" | "xl" | "icon";

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-brand-primary text-white hover:bg-brand-secondary shadow-wizard-md",
  secondary:
    "bg-brand-pearl text-brand-primary hover:bg-brand-mist border border-[rgb(var(--brand-mist))]",
  ghost: "text-brand-primary hover:bg-brand-pearl",
  outline:
    "border border-[rgb(var(--brand-primary))] text-brand-primary hover:bg-brand-primary hover:text-white",
  accent: "bg-brand-accent text-white hover:opacity-95 shadow-wizard-md",
  dark: "bg-white text-black hover:bg-brand-accent hover:text-white shadow-wizard-md",
};

const SIZE: Record<Size, string> = {
  sm: "h-9 px-3 text-[13px] rounded-full",
  md: "h-11 px-5 text-[14px] rounded-full",
  lg: "h-12 px-7 text-[15px] rounded-full",
  xl: "h-14 px-10 text-[15px] rounded-full tracking-[0.04em]",
  icon: "h-10 w-10 rounded-full",
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", loading, children, disabled, ...rest }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-medium transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--ring))] focus-visible:ring-offset-2 disabled:opacity-60 disabled:pointer-events-none",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <span className="size-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
      ) : null}
      {children}
    </button>
  ),
);
Button.displayName = "Button";
