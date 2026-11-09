/** Module roles (admin only): who may use the campaigns module and as what. */
import { z } from 'zod'
import type { Ctx } from '../context'
import { many, one, withTx } from '../db'
import { audit } from '../audit'
import { forbidden, invalid } from '../errors'
import { requireInternal } from '../auth/policy'
import { parseInput, zUuid } from '../validation'
import { PRODUCT } from '@/lib/campaigns/brand'

export async function listModuleUsers(ctx: Ctx) {
  const actor = requireInternal(ctx.actor)
  if (actor.role !== 'admin') throw forbidden('ניהול הרשאות שמור למנהל המערכת')
  return many<{ id: string; full_name: string; email: string; hub_role: string; cm_role: string | null; is_active: boolean }>(ctx.db,
    `select u.id, u.full_name, u.email, u.role::text as hub_role, r.role as cm_role, u.is_active
       from users u left join cm_staff_roles r on r.user_id = u.id order by (r.role is null), u.full_name limit 500`)
}

export async function setModuleRole(ctx: Ctx, input: unknown) {
  const actor = requireInternal(ctx.actor)
  if (actor.role !== 'admin') throw forbidden('ניהול הרשאות שמור למנהל המערכת')
  const v = parseInput(z.object({ user_id: zUuid, role: z.enum(['admin', 'manager', 'staff']).nullable() }), input)
  if (v.user_id === actor.userId && v.role !== 'admin') throw invalid('אי אפשר להסיר את הרשאת הניהול של עצמך')
  return withTx(async (tx) => {
    if (!(await one(tx, `select 1 from users where id = $1`, [v.user_id]))) throw invalid('המשתמש לא נמצא')
    if (v.role === null) await tx.query(`delete from cm_staff_roles where user_id = $1`, [v.user_id])
    else await tx.query(`insert into cm_staff_roles (user_id, role, granted_by) values ($1,$2,$3)
      on conflict (user_id) do update set role = excluded.role, granted_by = excluded.granted_by`, [v.user_id, v.role, actor.userId])
    await audit(tx, ctx, { campaignId: null, entityType: 'user', entityId: v.user_id, action: 'module.role_changed',
      summary: v.role ? `הוגדר תפקיד ${v.role} ב-${PRODUCT.name}` : `הוסרה הרשאה ל-${PRODUCT.name}` })
    return { ok: true }
  }, ctx.db)
}
