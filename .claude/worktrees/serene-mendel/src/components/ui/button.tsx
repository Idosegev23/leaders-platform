'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'accent' | 'ghost' | 'outline' | 'destructive' | 'premium' | 'ai'
  size?: 'sm' | 'md' | 'lg' | 'icon'
  isLoading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, children, disabled, ...props }, ref) => {
    const variants = {
      primary: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-wizard-md hover:shadow-wizard-lg hover:-translate-y-[1px]',
      secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
      accent: 'bg-brand-primary text-white hover:bg-brand-primary/90 shadow-[0_4px_20px_rgba(15,23,42,0.25)] hover:shadow-[0_4px_24px_rgba(242,204,13,0.3)] hover:-translate-y-[1px]',
      ghost: 'text-wizard-text-secondary hover:bg-brand-pearl hover:text-foreground',
      outline: 'border border-wizard-border text-foreground hover:bg-brand-pearl hover:border-primary/20',
      destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
      premium: 'text-white font-bold shadow-[0_4px_20px_rgba(15,23,42,0.25),0_2px_8px_rgba(242,204,13,0.2)] hover:shadow-[0_4px_24px_rgba(242,204,13,0.35),0_2px_10px_rgba(15,23,42,0.2)] hover:-translate-y-[1px]',
      ai: 'bg-gradient-to-l from-brand-primary/10 to-brand-gold/10 text-brand-primary border border-brand-primary/20 hover:from-brand-primary/15 hover:to-brand-gold/15 hover:border-brand-primary/30 hover:shadow-wizard-sm font-semibold',
    }

    const sizes = {
      sm: 'h-9 px-3 text-sm',
      md: 'h-11 px-5 text-base',
      lg: 'h-13 px-8 text-lg',
      icon: 'h-10 w-10',
    }

    return (
      <button
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200',
          'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-primary/10',
          'disabled:pointer-events-none disabled:opacity-50',
          variants[variant],
          sizes[size],
          className
        )}
        ref={ref}
        disabled={disabled || isLoading}
        style={variant === 'premium' ? { background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #f2cc0d 100%)' } : undefined}
        {...props}
      >
        {isLoading && (
          <svg
            className="h-4 w-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'

export { Button }





