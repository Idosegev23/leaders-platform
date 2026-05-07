import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-card text-card-foreground border border-[rgb(var(--brand-mist))] shadow-wizard-sm",
        className,
      )}
      {...rest}
    />
  );
}

export function CardHeader({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6 pb-3", className)} {...rest} />;
}

export function CardTitle({ className, ...rest }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("text-lg font-semibold tracking-tight text-brand-primary", className)}
      {...rest}
    />
  );
}

export function CardDescription({ className, ...rest }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted-foreground mt-1", className)} {...rest} />;
}

export function CardContent({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6 pt-3", className)} {...rest} />;
}

export function CardFooter({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center p-6 pt-0", className)} {...rest} />;
}
