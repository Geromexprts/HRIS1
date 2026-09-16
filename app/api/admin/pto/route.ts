import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import type { AccrualEvent } from '@/lib/pto'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await supabaseAdmin
    .from('employees')
    .select('id, name, employment_start_date, pto_balances(current_balance, last_accrual_date, accrual_history)')
    .eq('status', 'active')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { employee_id, delta, reason } = await req.json()
  if (!employee_id || delta === undefined || !reason?.trim()) {
    return NextResponse.json({ error: 'employee_id, delta, and reason are required.' }, { status: 400 })
  }

  const { data: existing } = await supabaseAdmin
    .from('pto_balances')
    .select('current_balance, accrual_history')
    .eq('employee_id', employee_id)
    .single()

  const previousBalance = existing?.current_balance ?? 0
  const history = (existing?.accrual_history ?? []) as AccrualEvent[]
  const newBalance = Math.max(0, previousBalance + delta)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })

  const newEvent: AccrualEvent = {
    type: 'manual_adjustment',
    days: delta,
    date: today,
    note: `Manual adjustment by admin: ${reason.trim()}`,
  }

  const { data, error } = await supabaseAdmin
    .from('pto_balances')
    .upsert({
      employee_id,
      current_balance: newBalance,
      accrual_history: [...history, newEvent],
    }, { onConflict: 'employee_id' })
    .select('current_balance')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabaseAdmin.from('audit_log').insert({
    employee_id,
    action: 'pto_adjustment',
    details: {
      delta,
      reason: reason.trim(),
      previous_balance: previousBalance,
      new_balance: newBalance,
      adjusted_by: session.user.id,
    },
    performed_at: new Date().toISOString(),
  })

  return NextResponse.json({ current_balance: data?.current_balance ?? newBalance })
}
