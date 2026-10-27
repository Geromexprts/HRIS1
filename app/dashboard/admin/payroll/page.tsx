import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { laPeriodBounds } from '@/lib/dates'
import { PayrollView } from '@/components/PayrollView'
import { computeAccrualUpdates, type AccrualEvent } from '@/lib/pto'

export default async function PayrollPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (session.user.role !== 'admin') redirect('/dashboard')

  const { periodStart, periodEnd } = laPeriodBounds()
  const periodLabel = `${periodStart} → ${periodEnd}`

  const [
    { data: employees },
    { data: entries },
    { data: leaveRequests },
    { data: ptoBalances },
    { data: deductions },
    { data: approvedOtRows },
  ] = await Promise.all([
    supabaseAdmin
      .from('employees')
      .select('id, name, work_email, office_location, monthly_salary, hourly_rate, employment_type, employment_end_date, approver_id, employment_start_date')
      .eq('status', 'active')
      .order('name'),
    supabaseAdmin
      .from('time_entries')
      .select('employee_id, total_hours, date')
      .gte('date', periodStart)
      .lte('date', periodEnd)
      .not('total_hours', 'is', null),
    supabaseAdmin
      .from('leave_requests')
      .select('employee_id, days_requested, leave_type')
      .eq('status', 'approved')
      .gte('start_date', periodStart)
      .lte('end_date', periodEnd),
    supabaseAdmin
      .from('pto_balances')
      .select('employee_id, current_balance, last_accrual_date, accrual_history'),
    supabaseAdmin
      .from('payroll_deductions')
      .select('employee_id, pto_days_used, shortfall_days, shortfall_deduction, net_pay, intake_booking_incentive, google_review_incentive, performance_incentive, referral_incentive, reimbursements, approved_ot_hours, paid_pto_days, unpaid_pto_days')
      .eq('pay_period_start', periodStart),
    supabaseAdmin
      .from('ot_requests')
      .select('employee_id, ot_hours')
      .eq('status', 'approved')
      .gte('date', periodStart)
      .lte('date', periodEnd),
  ])

  // Run PTO accrual for all active employees before computing payroll
  const ptoMap: Record<string, number> = {}
  const ptoByEmployee = Object.fromEntries((ptoBalances ?? []).map(p => [p.employee_id, p]))

  for (const emp of employees ?? []) {
    const pto = ptoByEmployee[emp.id]
    const startDate = (emp as { employment_start_date?: string | null }).employment_start_date

    if (startDate) {
      const result = computeAccrualUpdates({
        employmentStartDate: startDate,
        currentBalance: pto?.current_balance ?? 0,
        lastAccrualDate: pto?.last_accrual_date ?? null,
        accrualHistory: (pto?.accrual_history ?? []) as AccrualEvent[],
      })

      if (result.hasChanges) {
        const { data: updated } = await supabaseAdmin
          .from('pto_balances')
          .upsert({
            employee_id: emp.id,
            current_balance: result.newBalance,
            last_accrual_date: result.newLastAccrualDate,
            accrual_history: result.newAccrualHistory,
          }, { onConflict: 'employee_id' })
          .select('current_balance')
          .single()

        ptoMap[emp.id] = updated?.current_balance ?? result.newBalance
      } else {
        ptoMap[emp.id] = pto?.current_balance ?? 0
      }
    } else {
      ptoMap[emp.id] = pto?.current_balance ?? 0
    }
  }

  const hoursMap: Record<string, number> = {}
  for (const e of entries ?? []) {
    // cap at 8h/day — OT is tracked separately via ot_requests
    hoursMap[e.employee_id] = (hoursMap[e.employee_id] ?? 0) + Math.min(e.total_hours ?? 0, 8)
  }

  const leaveMap: Record<string, number> = {}
  const ptoPaidByEmp: Record<string, number> = {}
  const ptoUnpaidByEmp: Record<string, number> = {}
  for (const r of leaveRequests ?? []) {
    const days = r.days_requested ?? 0
    leaveMap[r.employee_id] = (leaveMap[r.employee_id] ?? 0) + days
    if (r.leave_type === 'unpaid') {
      ptoUnpaidByEmp[r.employee_id] = (ptoUnpaidByEmp[r.employee_id] ?? 0) + days
    } else {
      ptoPaidByEmp[r.employee_id] = (ptoPaidByEmp[r.employee_id] ?? 0) + days
    }
  }

  const approvedOtByEmp: Record<string, number> = {}
  for (const r of approvedOtRows ?? []) {
    approvedOtByEmp[r.employee_id] = (approvedOtByEmp[r.employee_id] ?? 0) + (r.ot_hours ?? 0)
  }

  function businessDaysBetween(start: string, end: string): number {
    const s = new Date(start + 'T12:00:00Z')
    const e = new Date(end + 'T12:00:00Z')
    let count = 0
    const cur = new Date(s)
    while (cur <= e) {
      const dow = cur.getUTCDay()
      if (dow !== 0 && dow !== 6) count++
      cur.setUTCDate(cur.getUTCDate() + 1)
    }
    return count
  }

  const workingDaysMap: Record<string, number> = {}
  for (const emp of employees ?? []) {
    const empStartStr = (emp as { employment_start_date?: string | null }).employment_start_date
    const empEndStr = emp.employment_end_date
    const effectiveStart = empStartStr && empStartStr > periodStart ? empStartStr : periodStart
    const effectiveEnd = empEndStr && empEndStr < periodEnd ? empEndStr : periodEnd
    workingDaysMap[emp.id] = effectiveStart <= effectiveEnd
      ? businessDaysBetween(effectiveStart, effectiveEnd)
      : 0
  }

  type DeductionRow = {
    pto_days_used: number
    shortfall_days: number
    shortfall_deduction: number
    net_pay: number
    intake_booking_incentive: number
    google_review_incentive: number
    performance_incentive: number
    referral_incentive: number
    reimbursements: number
  } | null
  const deductionMap: Record<string, DeductionRow> = {}
  for (const d of deductions ?? []) {
    deductionMap[d.employee_id] = {
      pto_days_used: d.pto_days_used ?? 0,
      shortfall_days: d.shortfall_days ?? 0,
      shortfall_deduction: d.shortfall_deduction ?? 0,
      net_pay: d.net_pay ?? 0,
      intake_booking_incentive: d.intake_booking_incentive ?? 0,
      google_review_incentive: d.google_review_incentive ?? 0,
      performance_incentive: d.performance_incentive ?? 0,
      referral_incentive: d.referral_incentive ?? 0,
      reimbursements: d.reimbursements ?? 0,
    }
  }

  // Strip employment_start_date from employees before passing to client component
  const employeesForView = (employees ?? []).map(({ id, name, work_email, office_location, monthly_salary, hourly_rate, employment_type, employment_end_date }) => ({
    id, name, work_email, office_location, monthly_salary,
    hourly_rate: hourly_rate ?? null,
    employment_type: employment_type ?? null,
    employment_end_date: employment_end_date ?? null,
  }))

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Payroll</h1>
        <p className="page-subtitle">Deduction breakdown for the current pay period. Set each employee&apos;s gross salary to compute deductions.</p>
      </div>
      <PayrollView
        employees={employeesForView}
        hoursMap={hoursMap}
        leaveMap={leaveMap}
        ptoMap={ptoMap}
        deductionMap={deductionMap}
        periodLabel={periodLabel}
        periodStart={periodStart}
        periodEnd={periodEnd}
        approvedOtMap={approvedOtByEmp}
        ptoPaidMap={ptoPaidByEmp}
        ptoUnpaidMap={ptoUnpaidByEmp}
        workingDaysMap={workingDaysMap}
      />
    </div>
  )
}
