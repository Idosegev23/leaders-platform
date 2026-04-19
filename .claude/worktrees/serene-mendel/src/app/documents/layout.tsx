import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardNav } from '@/components/layout/dashboard-nav'
import { isDevMode, DEV_USER } from '@/lib/auth/dev-mode'

export default async function DocumentsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // In dev mode, use mock user
  if (isDevMode) {
    return (
      <div className="min-h-screen bg-background">
        <DashboardNav user={DEV_USER} />
        <main className="pt-16">
          {children}
        </main>
      </div>
    )
  }

  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect('/login')
  }

  // Get user profile
  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single()

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav user={profile} />
      <main className="pt-16">
        {children}
      </main>
    </div>
  )
}




