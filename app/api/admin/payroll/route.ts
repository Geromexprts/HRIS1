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

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = adminGuard(session)
  if (guard) return guard

  const body = await req.json()
  const {
    employee_id,
    pay_period_start,
    pay_period_end,
    intake_booking_incentive,
    google_review_incentive,
    performance_incentive,
    referral_incentive,
    reimbursements,
    net_pay,
  } = body

  if (!employee_id || !pay_period_start) {
    return NextResponse.json({ error: 'employee_id and pay_period_start required.' }, { status: 400 })
  }

  const incentiveFields = {
    intake_booking_incentive: Number(intake_booking_incentive ?? 0),
    google_review_incentive: Number(google_review_incentive ?? 0),
    performance_incentive: Number(performance_incentive ?? 0),
    referral_incentive: Number(referral_incentive ?? 0),
    reimbursements: Number(reimbursements ?? 0),
  }

  const { data: existing } = await supabaseAdmin
    .from('payroll_deductions')
    .select('id')
    .eq('employee_id', employee_id)
    .eq('pay_period_start', pay_period_start)
    .single()

  const updateFields: Record<string, unknown> = {
    ...incentiveFields,
    ...(net_pay !== undefined ? { net_pay: Math.round(Number(net_pay) * 100) / 100 } : {}),
  }

  let data, error
  if (existing) {
    ;({ data, error } = await supabaseAdmin
      .from('payroll_deductions')
      .update(updateFields)
      .eq('employee_id', employee_id)
      .eq('pay_period_start', pay_period_start)
      .select('employee_id, intake_booking_incentive, google_review_incentive, performance_incentive, referral_incentive, reimbursements, net_pay')
      .single())
  } else {
    ;({ data, error } = await supabaseAdmin
      .from('payroll_deductions')
      .insert({
        employee_id,
        pay_period_start,
        pay_period_end: pay_period_end ?? null,
        ...incentiveFields,
        pto_days_used: 0,
        shortfall_days: 0,
        shortfall_deduction: 0,
        net_pay: net_pay !== undefined ? Math.round(Number(net_pay) * 100) / 100 : null,
      })
      .select('employee_id, intake_booking_incentive, google_review_incentive, performance_incentive, referral_incentive, reimbursements, net_pay')
      .single())
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
