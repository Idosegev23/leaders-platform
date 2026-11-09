import { notFound } from 'next/navigation'
import { selfSignupEnabled } from '@/lib/campaigns/runtime'
import { SignupForm } from '@/components/campaigns/staff-login'

export const dynamic = 'force-dynamic'

export default function SignupPage() {
  if (!selfSignupEnabled()) notFound()
  return <SignupForm />
}
