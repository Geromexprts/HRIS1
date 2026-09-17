import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { laToday } from '@/lib/dates'
import { computeAccrualUpdates, type AccrualEvent } from '@/lib/pto'
import { AdminPtoView } from '@/components/AdminPtoView'

const ACCRUAL_RATE = 0.03846

function monthsBetween(startDate: string, endDate: string): number {
  const s = new Date(startDate + 'T12:00:00')
  const e = new Date(endDate + 'T12:00:00')
  return (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth())
}

export default async function AdminPtoPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (session.user.role !== 'admin') redirect('/dashboard')

  const today = laToday()

  const [{ data: employees }, { data: balances }, { data: placedRecords }] = await Promise.all([
    supabaseAdmin.from('employees').select('id, name, employment_start_date, pto_policy').eq('status', 'active').order('name'),
    supabaseAdmin.from('pto_balances').select('employee_id, current_balance, last_accrual_date, accrual_history'),
    supabaseAdmin.from('placed_staff_pto').select('*'),
  ])

  const balanceMap = Object.fromEntries((balances ?? []).map(b => [b.employee_id, b]))
  const placedMap = Object.fromEntries((placedRecords ?? []).map(r => [r.employee_id, r]))

  // ── XPRTS staff: run accrual logic ──────────────────────────────────────────
  const xprtsEmployees = (employees ?? []).filter(e => (e.pto_policy ?? 'xprts') === 'xprts')
  const displayBalances: Record<string, number> = {}

  for (const emp of xprtsEmployees) {
    if (!emp.employment_start_date) {
      displayBalances[emp.id] = balanceMap[emp.id]?.current_balance ?? 0
      continue
    }
    const existing = balanceMap[emp.id]
    const result = computeAccrualUpdates({
      employmentStartDate: emp.employment_start_date,
      currentBalance: existing?.current_balance ?? 0,
      lastAccrualDate: existing?.last_accrual_date ?? null,
      accrualHistory: (existing?.accrual_history ?? []) as AccrualEvent[],
    })
    if (result.hasChanges) {
      await supabaseAdmin.from('pto_balances').upsert({
        employee_id: emp.id,
        current_balance: result.newBalance,
        last_accrual_date: result.newLastAccrualDate,
        accrual_history: result.newAccrualHistory,
      }, { onConflict: 'employee_id' })
      displayBalances[emp.id] = result.newBalance
      balanceMap[emp.id] = { ...balanceMap[emp.id], employee_id: emp.id, current_balance: result.newBalance, last_accrual_date: result.newLastAccrualDate, accrual_history: result.newAccrualHistory }
    } else {
      displayBalances[emp.id] = existing?.current_balance ?? 0
    }
  }

  const xprtsRows = xprtsEmployees.map(emp => ({
    id: emp.id,
    name: emp.name,
    employmentStartDate: emp.employment_start_date,
    balanceDays: displayBalances[emp.id] ?? 0,
    history: (balanceMap[emp.id]?.accrual_history ?? []) as AccrualEvent[],
  }))

  // ── Placed staff: compute from time entries ──────────────────────────────────
  const placedEmployees = (employees ?? []).filter(e => e.pto_policy === 'placed_staff')

  const placedStaffRows = await Promise.all(
    placedEmployees.map(async emp => {
      const record = placedMap[emp.id]
      const clientStartDate: string | null = record?.client_start_date ?? null
      const isFloating: boolean = record?.is_floating ?? false

      let tenureHoursWorked = 0
      let tenureMonths: number | null = null

      if (clientStartDate) {
        tenureMonths = monthsBetween(clientStartDate, today)
        const { data: timeEntries } = await supabaseAdmin
          .from('time_entries')
          .select('total_hours')
          .eq('employee_id', emp.id)
          .gte('date', clientStartDate)
        tenureHoursWorked = (timeEntries ?? []).reduce((s, e) => s + (e.total_hours ?? 0), 0)
      }

      const isEligible = !isFloating && tenureMonths !== null && tenureMonths >= 6
      const earnedPtoHours = isEligible ? Math.round(tenureHoursWorked * ACCRUAL_RATE * 100) / 100 : 0
      const manualAdjustmentHours: number = record?.manual_adjustment_hours ?? 0
      const currentBalanceHours = Math.max(0, earnedPtoHours + manualAdjustmentHours)

      return {
        id: emp.id,
        name: emp.name,
        clientName: record?.client_name ?? null,
        clientStartDate,
        isFloating,
        tenureMonths,
        isEligible,
        tenureHoursWorked: Math.round(tenureHoursWorked * 10) / 10,
        earnedPtoHours,
        manualAdjustmentHours,
        currentBalanceHours,
        adjustmentHistory: (record?.adjustment_history ?? []) as { date: string; delta_hours: number; reason: string }[],
        notes: record?.notes ?? null,
      }
    })
  )

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">PTO Management</h1>
        <p className="page-subtitle">Manage PTO balances across both policies · {today}</p>
      </div>
      <AdminPtoView xprtsRows={xprtsRows} placedStaffRows={placedStaffRows} today={today} />
    </div>
  )
}
