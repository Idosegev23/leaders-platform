import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardNav } from '@/components/layout/dashboard-nav'
import { HubTicker } from '@/components/layout/HubTicker'
import { AuthGuard } from '@/components/auth/AuthGuard'
import { isDevMode, DEV_USER } from '@/lib/auth/dev-mode'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  if (isDevMode) {
    return (
      <div className="min-h-screen bg-brand-pearl text-brand-primary">
        <AuthGuard />
        <DashboardNav user={DEV_USER} />
        <HubTicker />
        <main className="pt-16">{children}</main>
      </div>
    )
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single()

  return (
    <div className="min-h-screen bg-brand-pearl text-brand-primary">
      <AuthGuard />
      <DashboardNav user={profile} />
      <HubTicker />
      <main className="pt-16">{children}</main>
    </div>
  )
}
