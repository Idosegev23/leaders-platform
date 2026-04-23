'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn, getInitials } from '@/lib/utils'
import type { User } from '@/types/database'

interface DashboardNavProps {
  user: User | null
}

const NAV_ITEMS = [
  { href: '/dashboard', label: 'דף הבית' },
  { href: '/leads', label: 'לידים' },
  { href: '/create', label: 'יצירת מסמך' },
  { href: '/documents', label: 'המסמכים שלי' },
]

const ADMIN_ITEMS = [
  { href: '/admin/templates', label: 'עורך טמפלטים' },
  { href: '/admin/config', label: 'הגדרות' },
]

export function DashboardNav({ user }: DashboardNavProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut({ scope: 'global' })
    router.push('/login')
    router.refresh()
  }

  const linkClasses = (active: boolean) =>
    cn(
      'px-3 py-2 rounded-sm text-[13px] tracking-[0.02em] transition-colors',
      active ? 'text-white' : 'text-white/55 hover:text-white',
    )

  return (
    <header className="fixed top-0 inset-x-0 z-50 bg-[#0a0a0f]/80 backdrop-blur-md border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 md:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/dashboard" className="flex items-center gap-3 group">
            <Image
              src="/logo.png"
              alt="Leaders"
              width={90}
              height={30}
              className="h-auto w-[70px] md:w-[80px] opacity-90 group-hover:opacity-100 transition-opacity"
            />
            <span className="hidden md:inline text-[10px] tracking-[0.4em] uppercase text-white/40 font-rubik">
              x OS
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <Link key={item.href} href={item.href} className={linkClasses(pathname === item.href)}>
                {item.label}
              </Link>
            ))}

            {user?.role === 'admin' && (
              <>
                <div className="w-px h-4 bg-white/10 mx-3" />
                {ADMIN_ITEMS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={linkClasses(pathname.startsWith(item.href))}
                  >
                    {item.label}
                  </Link>
                ))}
              </>
            )}
          </nav>

          {/* User Menu */}
          <div className="relative flex items-center gap-2">
            <button
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className="flex items-center gap-2 p-1 rounded-sm hover:bg-white/5 transition-colors"
            >
              {user?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatar_url}
                  alt={user.full_name}
                  className="w-7 h-7 rounded-full object-cover"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-white/10 text-white flex items-center justify-center text-[11px] font-medium">
                  {getInitials(user?.full_name || 'U')}
                </div>
              )}
              <span className="hidden md:block text-[12px] font-medium text-white/70">
                {user?.full_name}
              </span>
            </button>

            {isUserMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsUserMenuOpen(false)} />
                <div className="absolute left-0 top-10 w-60 rounded-sm bg-[#0a0a0f] border border-white/10 shadow-xl z-50 overflow-hidden">
                  <div className="p-4 border-b border-white/10">
                    <p className="text-[14px] font-medium text-white truncate">{user?.full_name}</p>
                    <p className="text-[11px] text-white/50 truncate">{user?.email}</p>
                    {user?.role === 'admin' && (
                      <span className="inline-block mt-2 text-[9px] tracking-[0.32em] uppercase text-brand-gold font-rubik">
                        Admin
                      </span>
                    )}
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full text-right px-4 py-3 text-[13px] text-white/70 hover:bg-white/5 hover:text-brand-accent transition-colors"
                  >
                    התנתק
                  </button>
                </div>
              </>
            )}

            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="md:hidden p-2 rounded-sm hover:bg-white/5 transition-colors"
              aria-label="menu"
            >
              <MenuIcon />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMenuOpen && (
        <div className="md:hidden border-t border-white/10 bg-[#0a0a0f]">
          <nav className="px-4 py-3 space-y-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsMenuOpen(false)}
                className={cn(
                  'block px-3 py-3 rounded-sm text-[14px] transition-colors',
                  pathname === item.href ? 'bg-white/5 text-white' : 'text-white/60 hover:bg-white/5',
                )}
              >
                {item.label}
              </Link>
            ))}
            {user?.role === 'admin' && (
              <>
                <div className="h-px bg-white/10 my-2" />
                {ADMIN_ITEMS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMenuOpen(false)}
                    className={cn(
                      'block px-3 py-3 rounded-sm text-[14px] transition-colors',
                      pathname.startsWith(item.href)
                        ? 'bg-white/5 text-white'
                        : 'text-white/60 hover:bg-white/5',
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
              </>
            )}
          </nav>
        </div>
      )}
    </header>
  )
}

function MenuIcon() {
  return (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}
