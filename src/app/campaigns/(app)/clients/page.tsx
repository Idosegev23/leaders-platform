import { searchClients } from '@/lib/campaigns/services/clients'
import { orgHasHub } from '@/lib/campaigns/auth/policy'
import { ClientsManager } from '@/components/campaigns/clients-manager'
import { load, pageCtx } from '../_server'

export const dynamic = 'force-dynamic'

export default async function ClientsPage({ searchParams }: { searchParams: { q?: string } }) {
  const ctx = await pageCtx()
  const [clients, hub] = await Promise.all([load(() => searchClients(ctx, searchParams.q)), orgHasHub(ctx.db, ctx.actor.orgId)])
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">לקוחות</h1>
      <ClientsManager clients={clients} hub={hub} q={searchParams.q ?? ''} canCreate={ctx.actor.role !== 'staff'} />
    </div>
  )
}
