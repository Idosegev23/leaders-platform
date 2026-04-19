'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  hint?: string
  options: { value: string; label: string }[]
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, hint, id, options, ...props }, ref) => {
    const selectId = id || React.useId()

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={selectId}
            className="block text-[13px] font-heebo font-semibold mb-2.5 text-wizard-text-secondary tracking-[0.01em]"
          >
            {label}
          </label>
        )}
        <select
          id={selectId}
          className={cn(
            'flex h-12 w-full rounded-xl border bg-white px-4 py-2.5 appearance-none',
            'text-sm text-foreground',
            'focus-visible:outline-none focus-visible:border-brand-primary focus-visible:ring-[3px] focus-visible:ring-brand-primary/8',
            'hover:border-primary/20',
            'disabled:cursor-not-allowed disabled:opacity-40 disabled:bg-brand-pearl',
            'transition-all duration-200',
            error ? 'border-destructive ring-[3px] ring-destructive/8' : 'border-wizard-border',
            className
          )}
          ref={ref}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
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

Select.displayName = 'Select'

export { Select }





