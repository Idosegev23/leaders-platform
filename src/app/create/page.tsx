import { redirect } from 'next/navigation'

/**
 * Legacy entry — redirects to the canonical creator. Kept so old bookmarks
 * (and the `?type=quote` variant) keep working after the create-* routes
 * were consolidated.
 */
export default function CreateRedirect({
  searchParams,
}: {
  searchParams: { type?: string }
}) {
  if (searchParams.type === 'quote') redirect('/price-quote')
  redirect('/create-proposal')
}
