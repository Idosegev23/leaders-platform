'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  hint?: string
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const textareaId = id || React.useId()

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={textareaId}
            className="block text-[13px] font-heebo font-semibold mb-2.5 text-wizard-text-secondary tracking-[0.01em]"
          >
            {label}
          </label>
        )}
        <textarea
          id={textareaId}
          data-error={error ? 'true' : undefined}
          className={cn(
            'flex min-h-[120px] w-full rounded-xl border bg-white px-4 py-3',
            'text-sm leading-relaxed text-foreground placeholder:text-wizard-text-tertiary placeholder:font-light resize-none',
            'focus-visible:outline-none focus-visible:border-brand-primary focus-visible:ring-[3px] focus-visible:ring-brand-primary/8',
            'hover:border-primary/20',
            'disabled:cursor-not-allowed disabled:opacity-40 disabled:bg-brand-pearl',
            'transition-all duration-200',
            error ? 'border-destructive ring-[3px] ring-destructive/8' : 'border-wizard-border',
            className
          )}
          ref={ref}
          {...props}
        />
        {hint && !error && (
          <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
        )}
        {error && (
          <p className="mt-1.5 text-xs text-destructive">{error}</p>
        )}
      </div>
    )
  }
)

Textarea.displayName = 'Textarea'

export { Textarea }





