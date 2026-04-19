import { NextResponse } from 'next/server'

export const maxDuration = 30
import { getProviderStatus } from '@/lib/ai-provider'


export async function GET() {
  return NextResponse.json(getProviderStatus())
}
