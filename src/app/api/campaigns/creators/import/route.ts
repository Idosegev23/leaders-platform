import { z } from 'zod'
import { internal, readJson } from '@/lib/campaigns/http'
import { commitImport, previewImport } from '@/lib/campaigns/services/import'
import { parseInput } from '@/lib/campaigns/validation'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** { mode: 'preview' | 'commit', csv, create_missing_agencies? } */
export const POST = internal(async (ctx, req) => {
  const body = await readJson(req)
  const { mode } = parseInput(z.object({ mode: z.enum(['preview', 'commit']) }).passthrough(), body)
  return mode === 'preview' ? previewImport(ctx, body) : commitImport(ctx, body)
})
