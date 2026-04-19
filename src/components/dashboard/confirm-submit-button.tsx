'use client'

import { ReactNode } from 'react'

interface ConfirmSubmitButtonProps {
  confirmMessage: string
  className?: string
  title?: string
  children: ReactNode
}

/**
 * Submit button that asks for confirmation before allowing form submission.
 * Used inside Server Action <form> elements where onClick can't be passed
 * directly from a Server Component.
 */
export function ConfirmSubmitButton({
  confirmMessage,
  className,
  title,
  children,
}: ConfirmSubmitButtonProps) {
  return (
    <button
      type="submit"
      className={className}
      title={title}
      onClick={(e) => {
        if (!confirm(confirmMessage)) e.preventDefault()
      }}
    >
      {children}
    </button>
  )
}
