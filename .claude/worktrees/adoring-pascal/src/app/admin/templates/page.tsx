import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { formatDate, documentTypeLabels, styleLabels } from '@/lib/utils'

export default async function AdminTemplatesPage() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect('/login')
  }

  // Check if user is admin
  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    redirect('/dashboard')
  }

  // Get all templates
  const { data: templates } = await supabase
    .from('templates')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-heebo font-bold mb-2">עורך טמפלטים</h1>
          <p className="text-muted-foreground">
            ניהול טמפלטים למסמכים
          </p>
        </div>
        <Link href="/admin/templates/new">
          <Button variant="accent">
            <PlusIcon className="w-4 h-4" />
            טמפלט חדש
          </Button>
        </Link>
      </div>

      {/* Templates Grid */}
      {templates && templates.length > 0 ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((template) => (
            <Link key={template.id} href={`/admin/templates/${template.id}`}>
              <Card className="h-full hover:shadow-lg transition-all duration-300 hover:-translate-y-1 cursor-pointer overflow-hidden">
                {/* Preview Header */}
                <div 
                  className="h-24 relative"
                  style={{ 
                    backgroundColor: (template.colors as { primary?: string })?.primary || '#1a1a2e' 
                  }}
                >
                  {template.logo_url && (
                    <img 
                      src={template.logo_url} 
                      alt="" 
                      className="absolute top-4 right-4 h-8 object-contain"
                    />
                  )}
                  {template.is_default && (
                    <span className="absolute top-4 left-4 px-2 py-1 rounded-full text-xs bg-white/20 text-white">
                      ברירת מחדל
                    </span>
                  )}
                </div>
                
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      template.type === 'quote' 
                        ? 'bg-accent/10 text-accent'
                        : 'bg-brand-gold/10 text-brand-gold'
                    }`}>
                      {documentTypeLabels[template.type]}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">
                      {styleLabels[template.style]}
                    </span>
                  </div>
                  <h3 className="font-bold text-lg mb-1">{template.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    נוצר ב-{formatDate(template.created_at)}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card className="p-12 text-center">
          <div className="text-muted-foreground mb-4">
            <TemplateEmptyIcon className="w-20 h-20 mx-auto opacity-50" />
          </div>
          <h3 className="text-xl font-bold mb-2">אין טמפלטים עדיין</h3>
          <p className="text-muted-foreground mb-6">צור טמפלט ראשון כדי להתחיל</p>
          <Link href="/admin/templates/new">
            <Button variant="accent" size="lg">
              <PlusIcon className="w-4 h-4" />
              צור טמפלט חדש
            </Button>
          </Link>
        </Card>
      )}
    </div>
  )
}

// Icons
function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  )
}

function TemplateEmptyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
    </svg>
  )
}





