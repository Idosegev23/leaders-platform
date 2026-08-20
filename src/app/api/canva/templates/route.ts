import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth/api-auth'
import { listBrandTemplates, getBrandTemplateDataset } from '@/lib/canva/brand-templates'

export const dynamic = 'force-dynamic'

/**
 * GET /api/canva/templates?dataset=non_empty&withFields=1
 * List the org's Canva brand templates; withFields=1 also resolves each
 * template's autofill dataset (extra API call per template).
 */
export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dataset = request.nextUrl.searchParams.get('dataset') === 'non_empty' ? 'non_empty' : 'any'
  const withFields = request.nextUrl.searchParams.get('withFields') === '1'

  try {
    const items = await listBrandTemplates({ dataset })
    if (!withFields) return NextResponse.json({ templates: items })

    const templates = await Promise.all(
      items.map(async (t) => {
        try {
          const fields = await getBrandTemplateDataset(t.id)
          return { ...t, fields }
        } catch {
          return { ...t, fields: {} }
        }
      }),
    )
    return NextResponse.json({ templates })
  } catch (e) {
    console.error('[canva-templates] failed:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 502 })
  }
}
