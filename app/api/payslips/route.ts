import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

// GET /api/payslips?from=YYYY-MM-DD&to=YYYY-MM-DD
// Employees see own applied payslips; admins see own applied payslips too (admin has own profile)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  let query = supabaseAdmin
    .from('payslips')
    .select('id, pay_date, pay_period_start, pay_period_end, pay_schedule, hours_worked, rate, gross_pay, deductions, net_pay, pto_balance, status, applied_at')
    .eq('employee_id', session.user.id)
    .eq('status', 'applied')
    .order('pay_date', { ascending: false })

  if (from) query = query.gte('pay_date', from)
  if (to) query = query.lte('pay_date', to)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
