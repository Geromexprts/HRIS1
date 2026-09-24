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

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = adminGuard(session)
  if (guard) return guard

  const { searchParams } = new URL(req.url)
  const employeeId = searchParams.get('employee_id')

  let query = supabaseAdmin
    .from('payslips')
    .select('*, employees(name, work_email)')
    .order('pay_date', { ascending: false })

  if (employeeId) query = query.eq('employee_id', employeeId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = adminGuard(session)
  if (guard) return guard

  const body = await req.json()
  const {
    employee_id, pay_schedule, pay_date, pay_period_start, pay_period_end,
    hours_worked, rate, deductions, pto_balance, notes, status,
  } = body

  if (!employee_id || !pay_schedule || !pay_date || !pay_period_start || !pay_period_end) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
  }

  const parsedHours = parseFloat(hours_worked) || 0
  const parsedRate = parseFloat(rate) || 0
  const parsedDeductions = parseFloat(deductions) || 0
  const gross_pay = parsedRate ? Math.round(parsedHours * parsedRate * 100) / 100 : null
  const net_pay = gross_pay != null ? Math.max(0, Math.round((gross_pay - parsedDeductions) * 100) / 100) : null
  const isApplied = status === 'applied'

  const { data, error } = await supabaseAdmin
    .from('payslips')
    .insert({
      employee_id,
      pay_schedule,
      pay_date,
      pay_period_start,
      pay_period_end,
      hours_worked: parsedHours,
      rate: parsedRate || null,
      gross_pay,
      deductions: parsedDeductions,
      net_pay,
      pto_balance: pto_balance ?? null,
      notes: notes?.trim() || null,
      status: isApplied ? 'applied' : 'draft',
      applied_at: isApplied ? new Date().toISOString() : null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabaseAdmin.from('audit_log').insert({
    employee_id,
    action: 'payslip_created',
    details: {
      payslip_id: data.id,
      status: data.status,
      pay_date,
      pay_period: `${pay_period_start} → ${pay_period_end}`,
      created_by: session!.user!.email,
    },
    performed_at: new Date().toISOString(),
  })

  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = adminGuard(session)
  if (guard) return guard

  const body = await req.json()
  const { id, rate, deductions, hours_worked, pto_balance, notes, status } = body

  if (!id) return NextResponse.json({ error: 'id required.' }, { status: 400 })

  const { data: existing } = await supabaseAdmin
    .from('payslips')
    .select('hours_worked, rate, deductions, status, employee_id')
    .eq('id', id)
    .single()

  if (!existing) return NextResponse.json({ error: 'Payslip not found.' }, { status: 404 })

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

  const finalHours = hours_worked !== undefined ? (parseFloat(hours_worked) || 0) : (existing.hours_worked ?? 0)
  const finalRate = rate !== undefined ? (parseFloat(rate) || 0) : (existing.rate ?? 0)
  const finalDeductions = deductions !== undefined ? (parseFloat(deductions) || 0) : (existing.deductions ?? 0)

  if (hours_worked !== undefined) update.hours_worked = finalHours
  if (rate !== undefined) update.rate = finalRate || null
  if (deductions !== undefined) update.deductions = finalDeductions
  if (pto_balance !== undefined) update.pto_balance = pto_balance ?? null
  if (notes !== undefined) update.notes = notes?.trim() || null

  if (finalRate) {
    update.gross_pay = Math.round(finalHours * finalRate * 100) / 100
    update.net_pay = Math.max(0, Math.round(((update.gross_pay as number) - finalDeductions) * 100) / 100)
  }

  if (status === 'applied' && existing.status !== 'applied') {
    update.status = 'applied'
    update.applied_at = new Date().toISOString()
  } else if (status === 'draft' && existing.status !== 'draft') {
    update.status = 'draft'
    update.applied_at = null
  }

  const { data, error } = await supabaseAdmin.from('payslips').update(update).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (status === 'applied' && existing.status !== 'applied') {
    await supabaseAdmin.from('audit_log').insert({
      employee_id: existing.employee_id,
      action: 'payslip_applied',
      details: { payslip_id: id, applied_by: session!.user!.email },
      performed_at: new Date().toISOString(),
    })
  }

  return NextResponse.json(data)
}
