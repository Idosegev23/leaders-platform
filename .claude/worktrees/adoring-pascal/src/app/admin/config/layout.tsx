'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const CATEGORIES = [
  { href: '/admin/config/prompts', label: 'פרומפטים AI', icon: '💬' },
  { href: '/admin/config/models', label: 'מודלי AI', icon: '🤖' },
  { href: '/admin/config/design', label: 'מערכת עיצוב', icon: '🎨' },
  { href: '/admin/config/pipeline', label: 'Pipeline', icon: '⚡' },
  { href: '/admin/config/flags', label: 'Feature Flags', icon: '🚩' },
  { href: '/admin/config/history', label: 'היסטוריה', icon: '📋' },
]

export default function AdminConfigLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div dir="rtl" className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-heebo font-bold text-foreground">הגדרות מערכת</h1>
        <p className="text-sm text-muted-foreground mt-1">שליטה בפרומפטים, מודלים, עיצוב וכל פרמטר במערכת</p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
        <nav className="w-52 flex-shrink-0">
          <div className="sticky top-24 space-y-1">
            {CATEGORIES.map((cat) => {
              const isActive = pathname === cat.href || pathname?.startsWith(cat.href + '/')
              return (
                <Link
                  key={cat.href}
                  href={cat.href}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-heebo transition-all',
                    isActive
                      ? 'bg-accent/10 text-accent font-semibold shadow-sm'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <span className="text-base">{cat.icon}</span>
                  <span>{cat.label}</span>
                </Link>
              )
            })}
          </div>
        </nav>

        {/* Content */}
        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>
    </div>
  )
}
