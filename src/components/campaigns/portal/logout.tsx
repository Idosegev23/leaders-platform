'use client'

import { usePathname } from 'next/navigation'

export function PortalLogout() {
  const path = usePathname()
  if (path?.startsWith('/portal/enter') || path?.startsWith('/portal/login')) return null
  return (
    <button type="button" className="text-xs text-wizard-text-secondary underline" onClick={async () => {
      await fetch('/api/portal/session', { method: 'DELETE' })
      window.location.href = '/portal/login'
    }}>יציאה</button>
  )
}
