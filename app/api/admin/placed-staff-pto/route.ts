import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import type { Session } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

function adminGuard(session: Session | null) {
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return null
}

// POST: switch an employee to placed_staff policy (creates record if not exists)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = adminGuard(session)
  if (guard) return guard

  const { employee_id } = await req.json()
  if (!employee_id) return NextResponse.json({ error: 'employee_id required.' }, { status: 400 })

  await supabaseAdmin.from('employees').update({ pto_policy: 'placed_staff' }).eq('id', employee_id)
  await supabaseAdmin.from('placed_staff_pto').upsert({ employee_id }, { onConflict: 'employee_id', ignoreDuplicates: true })

  return NextResponse.json({ ok: true })
}

// PUT: update client info, floating status, notes; or switch back to xprts
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = adminGuard(session)
  if (guard) return guard

  const body = await req.json()
  const { employee_id, pto_policy, client_name, client_start_date, is_floating, notes, reset_client } = body
  if (!employee_id) return NextResponse.json({ error: 'employee_id required.' }, { status: 400 })

  if (pto_policy === 'xprts') {
    await supabaseAdmin.from('employees').update({ pto_policy: 'xprts' }).eq('id', employee_id)
    return NextResponse.json({ ok: true })
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (client_name !== undefined) update.client_name = client_name || null
  if (client_start_date !== undefined) update.client_start_date = client_start_date || null
  if (is_floating !== undefined) update.is_floating = is_floating
  if (notes !== undefined) update.notes = notes || null
  if (reset_client) {
    update.manual_adjustment_hours = 0
    update.adjustment_history = []
  }

  await supabaseAdmin.from('placed_staff_pto').update(update).eq('employee_id', employee_id)

  return NextResponse.json({ ok: true })
}

// PATCH: manual hours adjustment
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = adminGuard(session)
  if (guard) return guard

  const { employee_id, delta_hours, reason } = await req.json()
  if (!employee_id || delta_hours === undefined || !reason?.trim()) {
    return NextResponse.json({ error: 'employee_id, delta_hours, and reason are required.' }, { status: 400 })
  }

  const { data: existing } = await supabaseAdmin
    .from('placed_staff_pto')
    .select('manual_adjustment_hours, adjustment_history')
    .eq('employee_id', employee_id)
    .single()

  const prev = existing?.manual_adjustment_hours ?? 0
  const history = (existing?.adjustment_history ?? []) as unknown[]
  const newAdjustment = prev + delta_hours
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })

  const newEntry = {
    date: today,
    delta_hours: delta_hours,
    reason: reason.trim(),
    adjusted_by: session!.user!.email,
  }

  const { error } = await supabaseAdmin
    .from('placed_staff_pto')
    .update({
      manual_adjustment_hours: newAdjustment,
      adjustment_history: [...history, newEntry],
      updated_at: new Date().toISOString(),
    })
    .eq('employee_id', employee_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabaseAdmin.from('audit_log').insert({
    employee_id,
    action: 'placed_staff_pto_adjustment',
    details: { delta_hours, reason: reason.trim(), previous_adjustment: prev, new_adjustment: newAdjustment, adjusted_by: session!.user!.email },
    performed_at: new Date().toISOString(),
  })

  return NextResponse.json({ ok: true, manual_adjustment_hours: newAdjustment })
}
