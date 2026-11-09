import Link from 'next/link'
import { listTasks } from '@/lib/campaigns/services/tasks'
import { TaskList } from '@/components/campaigns/workspace/tasks-tab'
import { load, pageCtx } from '../_server'

export const dynamic = 'force-dynamic'

export default async function MyTasksPage({ searchParams }: { searchParams: { all?: string } }) {
  const ctx = await pageCtx()
  const all = searchParams.all === '1'
  const tasks = await load(() => listTasks(ctx, { mine: all ? undefined : 'true', status: 'active', audience: 'internal', page_size: 200 }))
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{all ? 'כל המשימות הפתוחות' : 'המשימות שלי'}</h1>
        <Link href={all ? '/campaigns/tasks' : '/campaigns/tasks?all=1'} className="text-sm text-brand-primary underline">{all ? 'רק שלי' : 'כל המשימות בקמפיינים שלי'}</Link>
      </div>
      <TaskList tasks={JSON.parse(JSON.stringify(tasks.rows))} showCampaign />
    </div>
  )
}
