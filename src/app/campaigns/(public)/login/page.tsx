import { redirect } from 'next/navigation'
import { currentStaff, devAuthEnabled, hubLoginEnabled, selfSignupEnabled } from '@/lib/campaigns/runtime'
import { StaffLogin } from '@/components/campaigns/staff-login'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  const s = await currentStaff()
  if (s.actor) redirect('/campaigns')
  return <StaffLogin dev={devAuthEnabled()} hub={hubLoginEnabled()} signup={selfSignupEnabled()} signedInWithoutOrg={s.account?.email ?? null} />
}
