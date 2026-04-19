'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@/components/ui'
import { PageLoader } from '@/components/ui/spinner'
import type { Template, TemplateStyle, DocumentType } from '@/types/database'

const DEFAULT_COLORS = {
  primary: '#1a1a2e',
  secondary: '#16213e',
  accent: '#e94560',
  background: '#ffffff',
  text: '#1a1a2e',
}

const DEFAULT_FONTS = {
  heading: 'Heebo',
  body: 'Assistant',
  accent: 'Rubik',
}

export default function TemplateEditorPage() {
  const router = useRouter()
  const params = useParams()
  const isNew = params.id === 'new'
  
  const [isLoading, setIsLoading] = useState(!isNew)
  const [isSaving, setIsSaving] = useState(false)
  const [template, setTemplate] = useState<Partial<Template>>({
    name: '',
    type: 'quote',
    style: 'minimal',
    colors: DEFAULT_COLORS,
    fonts: DEFAULT_FONTS,
    logo_url: '',
    is_default: false,
    header_config: { showLogo: true, showDate: true, showPageNumbers: true },
    footer_config: { text: '', showPageNumbers: true },
  })

  useEffect(() => {
    if (!isNew) {
      loadTemplate()
    }
  }, [params.id])

  const loadTemplate = async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('templates')
      .select('*')
      .eq('id', params.id)
      .single()

    if (error || !data) {
      router.push('/admin/templates')
      return
    }

    setTemplate(data)
    setIsLoading(false)
  }

  const handleSave = async () => {
    if (!template.name) {
      alert('נא להזין שם לטמפלט')
      return
    }

    setIsSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      router.push('/login')
      return
    }

    try {
      if (isNew) {
        const { error } = await supabase.from('templates').insert({
          ...template,
          created_by: user.id,
        })
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('templates')
          .update(template)
          .eq('id', params.id)
        if (error) throw error
      }

      router.push('/admin/templates')
    } catch (error) {
      console.error('Error saving template:', error)
      alert('שגיאה בשמירת הטמפלט')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('האם אתה בטוח שברצונך למחוק את הטמפלט?')) return

    const supabase = createClient()
    const { error } = await supabase
      .from('templates')
      .delete()
      .eq('id', params.id)

    if (error) {
      console.error('Error deleting template:', error)
      alert('שגיאה במחיקת הטמפלט')
      return
    }

    router.push('/admin/templates')
  }

  const updateColors = (key: string, value: string) => {
    setTemplate(prev => ({
      ...prev,
      colors: { ...(prev.colors as Record<string, string>), [key]: value },
    }))
  }

  const updateFonts = (key: string, value: string) => {
    setTemplate(prev => ({
      ...prev,
      fonts: { ...(prev.fonts as Record<string, string>), [key]: value },
    }))
  }

  if (isLoading) {
    return <PageLoader />
  }

  const colors = template.colors as typeof DEFAULT_COLORS
  const fonts = template.fonts as typeof DEFAULT_FONTS

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-heebo font-bold mb-2">
            {isNew ? 'טמפלט חדש' : 'עריכת טמפלט'}
          </h1>
          <p className="text-muted-foreground">
            הגדר את העיצוב והמבנה של הטמפלט
          </p>
        </div>
        <div className="flex gap-3">
          {!isNew && (
            <Button variant="destructive" onClick={handleDelete}>
              מחק
            </Button>
          )}
          <Button variant="secondary" onClick={() => router.push('/admin/templates')}>
            ביטול
          </Button>
          <Button variant="accent" onClick={handleSave} isLoading={isSaving}>
            שמור
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Editor Panel */}
        <div className="space-y-6">
          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle>פרטי הטמפלט</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                label="שם הטמפלט"
                value={template.name}
                onChange={(e) => setTemplate(prev => ({ ...prev, name: e.target.value }))}
                placeholder="לדוגמה: טמפלט עסקי"
              />

              <div>
                <label className="block text-sm font-medium mb-2">סוג מסמך</label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setTemplate(prev => ({ ...prev, type: 'quote' }))}
                    className={`flex-1 p-4 rounded-lg border-2 transition-all ${
                      template.type === 'quote'
                        ? 'border-accent bg-accent/5'
                        : 'border-border hover:border-muted-foreground'
                    }`}
                  >
                    <span className="font-medium">הצעת מחיר</span>
                    <p className="text-sm text-muted-foreground mt-1">A4 Portrait</p>
                  </button>
                  <button
                    onClick={() => setTemplate(prev => ({ ...prev, type: 'deck' }))}
                    className={`flex-1 p-4 rounded-lg border-2 transition-all ${
                      template.type === 'deck'
                        ? 'border-brand-gold bg-brand-gold/5'
                        : 'border-border hover:border-muted-foreground'
                    }`}
                  >
                    <span className="font-medium">מצגת</span>
                    <p className="text-sm text-muted-foreground mt-1">16:9</p>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">סגנון עיצוב</label>
                <div className="flex gap-3">
                  {(['minimal', 'bold', 'premium'] as TemplateStyle[]).map((style) => (
                    <button
                      key={style}
                      onClick={() => setTemplate(prev => ({ ...prev, style }))}
                      className={`flex-1 p-3 rounded-lg border-2 transition-all ${
                        template.style === style
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-muted-foreground'
                      }`}
                    >
                      <span className="font-medium">
                        {style === 'minimal' ? 'מינימליסטי' : style === 'bold' ? 'בולט' : 'פרימיום'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="isDefault"
                  checked={template.is_default}
                  onChange={(e) => setTemplate(prev => ({ ...prev, is_default: e.target.checked }))}
                  className="w-4 h-4"
                />
                <label htmlFor="isDefault" className="text-sm">הגדר כטמפלט ברירת מחדל</label>
              </div>
            </CardContent>
          </Card>

          {/* Colors */}
          <Card>
            <CardHeader>
              <CardTitle>צבעים</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(colors).map(([key, value]) => (
                <div key={key} className="flex items-center gap-4">
                  <div
                    className="w-10 h-10 rounded-lg border border-border shadow-sm"
                    style={{ backgroundColor: value }}
                  />
                  <input
                    type="color"
                    value={value}
                    onChange={(e) => updateColors(key, e.target.value)}
                    className="sr-only"
                    id={`color-${key}`}
                  />
                  <label
                    htmlFor={`color-${key}`}
                    className="flex-1 cursor-pointer"
                  >
                    <span className="font-medium capitalize">
                      {key === 'primary' ? 'ראשי' : 
                       key === 'secondary' ? 'משני' : 
                       key === 'accent' ? 'הדגשה' : 
                       key === 'background' ? 'רקע' : 'טקסט'}
                    </span>
                    <span className="text-sm text-muted-foreground mr-2">{value}</span>
                  </label>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Fonts */}
          <Card>
            <CardHeader>
              <CardTitle>פונטים</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(fonts).map(([key, value]) => (
                <div key={key}>
                  <label className="block text-sm font-medium mb-2">
                    {key === 'heading' ? 'כותרות' : key === 'body' ? 'גוף טקסט' : 'הדגשות'}
                  </label>
                  <select
                    value={value}
                    onChange={(e) => updateFonts(key, e.target.value)}
                    className="input"
                  >
                    <option value="Heebo">Heebo</option>
                    <option value="Assistant">Assistant</option>
                    <option value="Rubik">Rubik</option>
                  </select>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Logo */}
          <Card>
            <CardHeader>
              <CardTitle>לוגו</CardTitle>
            </CardHeader>
            <CardContent>
              <Input
                label="כתובת URL של הלוגו"
                value={template.logo_url || ''}
                onChange={(e) => setTemplate(prev => ({ ...prev, logo_url: e.target.value }))}
                placeholder="https://..."
              />
              {template.logo_url && (
                <div className="mt-4 p-4 bg-muted rounded-lg">
                  <img
                    src={template.logo_url}
                    alt="Preview"
                    className="max-h-16 object-contain"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Preview Panel */}
        <div className="lg:sticky lg:top-24 h-fit">
          <Card>
            <CardHeader>
              <CardTitle>תצוגה מקדימה</CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className="rounded-lg overflow-hidden shadow-lg"
                style={{
                  aspectRatio: template.type === 'quote' ? '210/297' : '16/9',
                }}
              >
                <div
                  className="w-full h-full p-6 flex flex-col"
                  style={{
                    backgroundColor: colors.background,
                    color: colors.text,
                    fontFamily: fonts.body,
                  }}
                >
                  {/* Header */}
                  <div
                    className="p-4 rounded-lg mb-4 flex items-center justify-between"
                    style={{ backgroundColor: colors.primary }}
                  >
                    {template.logo_url ? (
                      <img src={template.logo_url} alt="" className="h-6" />
                    ) : (
                      <div className="h-6 w-20 bg-white/20 rounded" />
                    )}
                    <span className="text-white/80 text-xs">21/12/2024</span>
                  </div>

                  {/* Content */}
                  <div className="flex-1">
                    <h2
                      className="text-lg font-bold mb-2"
                      style={{ fontFamily: fonts.heading, color: colors.primary }}
                    >
                      {template.type === 'quote' ? 'הצעת מחיר' : 'כותרת המצגת'}
                    </h2>
                    <div className="space-y-2">
                      <div className="h-3 rounded bg-muted w-3/4" />
                      <div className="h-3 rounded bg-muted w-1/2" />
                      <div className="h-3 rounded bg-muted w-2/3" />
                    </div>

                    {template.type === 'quote' && (
                      <div className="mt-4 border-t pt-4">
                        <div className="flex justify-between text-sm mb-2">
                          <span>פריט לדוגמה</span>
                          <span style={{ color: colors.accent }}>1,500</span>
                        </div>
                        <div className="flex justify-between font-bold">
                          <span>סה"כ</span>
                          <span style={{ color: colors.accent }}>1,500</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div
                    className="text-xs text-center pt-4 border-t"
                    style={{ color: colors.secondary }}
                  >
                    עמוד 1 מתוך 1
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}





