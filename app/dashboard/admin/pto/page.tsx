import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { laToday } from '@/lib/dates'
import { computeAccrualUpdates, type AccrualEvent } from '@/lib/pto'
import { AdminPtoView } from '@/components/AdminPtoView'

export default async function AdminPtoPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (session.user.role !== 'admin') redirect('/dashboard')

  const today = laToday()

  const [{ data: employees }, { data: balances }] = await Promise.all([
    supabaseAdmin
      .from('employees')
      .select('id, name, employment_start_date')
      .eq('status', 'active')
      .order('name'),
    supabaseAdmin
      .from('pto_balances')
      .select('employee_id, current_balance, last_accrual_date, accrual_history'),
  ])

  const balanceMap = Object.fromEntries((balances ?? []).map(b => [b.employee_id, b]))

  // Run accrual logic for each employee and save any changes
  const displayBalances: Record<string, number> = {}
  for (const emp of employees ?? []) {
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
      // Update the in-memory map so history shown is current
      balanceMap[emp.id] = {
        ...balanceMap[emp.id],
        employee_id: emp.id,
        current_balance: result.newBalance,
        last_accrual_date: result.newLastAccrualDate,
        accrual_history: result.newAccrualHistory,
      }
    } else {
      displayBalances[emp.id] = existing?.current_balance ?? 0
    }
  }

  const rows = (employees ?? []).map(emp => ({
    id: emp.id,
    name: emp.name,
    employmentStartDate: emp.employment_start_date,
    balanceDays: displayBalances[emp.id] ?? 0,
    history: (balanceMap[emp.id]?.accrual_history ?? []) as AccrualEvent[],
  }))

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">PTO Management</h1>
        <p className="page-subtitle">Employee PTO balances · Policy: 8 days at 6 months, reset Jan 1 · {today}</p>
      </div>
      <AdminPtoView rows={rows} today={today} />
    </div>
  )
}
