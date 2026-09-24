import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

// GET /api/admin/payslips/hours?employee_id=X&from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns hours worked and PTO balance snapshot for the create-payslip form
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const employeeId = searchParams.get('employee_id')
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  if (!employeeId || !from || !to) {
    return NextResponse.json({ error: 'employee_id, from, and to are required.' }, { status: 400 })
  }

  const [{ data: timeEntries }, { data: ptoBalance }, { data: emp }] = await Promise.all([
    supabaseAdmin
      .from('time_entries')
      .select('total_hours')
      .eq('employee_id', employeeId)
      .gte('date', from)
      .lte('date', to)
      .not('total_hours', 'is', null),
    supabaseAdmin
      .from('pto_balances')
      .select('current_balance')
      .eq('employee_id', employeeId)
      .single(),
    supabaseAdmin
      .from('employees')
      .select('pto_policy')
      .eq('id', employeeId)
      .single(),
  ])

  const hoursWorked = (timeEntries ?? []).reduce((sum, e) => sum + (e.total_hours ?? 0), 0)

  let ptoBalanceValue: number | null = null
  let ptoUnit = 'days'

  if (emp?.pto_policy === 'placed_staff') {
    // For placed staff, compute from placed_staff_pto
    const { data: psRecord } = await supabaseAdmin
      .from('placed_staff_pto')
      .select('client_start_date, is_floating, manual_adjustment_hours')
      .eq('employee_id', employeeId)
      .single()

    if (psRecord?.client_start_date && !psRecord.is_floating) {
      const { data: tenureEntries } = await supabaseAdmin
        .from('time_entries')
        .select('total_hours')
        .eq('employee_id', employeeId)
        .gte('date', psRecord.client_start_date)
        .not('total_hours', 'is', null)

      const tenureHours = (tenureEntries ?? []).reduce((s, e) => s + (e.total_hours ?? 0), 0)
      const earned = Math.round(tenureHours * 0.03846 * 100) / 100
      ptoBalanceValue = Math.max(0, earned + (psRecord.manual_adjustment_hours ?? 0))
      ptoUnit = 'hrs'
    }
  } else {
    ptoBalanceValue = ptoBalance?.current_balance ?? null
    ptoUnit = 'days'
  }

  return NextResponse.json({
    hours_worked: Math.round(hoursWorked * 100) / 100,
    pto_balance: ptoBalanceValue,
    pto_unit: ptoUnit,
  })
}
