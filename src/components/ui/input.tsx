'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, error, hint, id, ...props }, ref) => {
    const inputId = id || React.useId()

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-[13px] font-heebo font-semibold mb-2.5 text-wizard-text-secondary tracking-[0.01em]"
          >
            {label}
          </label>
        )}
        <input
          type={type}
          id={inputId}
          data-error={error ? 'true' : undefined}
          className={cn(
            'flex h-12 w-full rounded-xl border bg-white px-4 py-2.5',
            'text-sm text-foreground placeholder:text-wizard-text-tertiary placeholder:font-light',
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

Input.displayName = 'Input'

export { Input }





