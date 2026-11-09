import { redirect } from 'next/navigation'
import { currentInternalActor, devAuthEnabled } from '@/lib/campaigns/runtime'

export const dynamic = 'force-dynamic'

// The layout renders the dev login form when nobody is signed in.
export default async function DevLoginPage() {
  if (!devAuthEnabled()) redirect('/login?redirect=/campaigns')
  if (await currentInternalActor()) redirect('/campaigns')
  return null
}
