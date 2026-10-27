import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { laToday, laPeriodBounds } from '@/lib/dates'
import { AdminTimeView } from '@/components/AdminTimeView'

export default async function AdminTimePage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (session.user.role !== 'admin') redirect('/dashboard')

  const today = laToday()
  const { periodStart, periodEnd } = laPeriodBounds()

  // Compute previous pay period (26th of 2 months ago → 25th of last month)
  const [py, pm] = periodStart.split('-').map(Number)
  const prevM = pm - 1 <= 0 ? 12 : pm - 1
  const prevY = pm - 1 <= 0 ? py - 1 : py
  const prevPrevM = prevM - 1 <= 0 ? 12 : prevM - 1
  const prevPrevY = prevM - 1 <= 0 ? prevY - 1 : prevY
  const prevPeriodStart = `${prevPrevY}-${String(prevPrevM).padStart(2, '0')}-26`
  const prevPeriodEnd = `${prevY}-${String(prevM).padStart(2, '0')}-25`

  // Derived date ranges
  const [year, month, day] = today.split('-').map(Number)
  const yDay = new Date(Date.UTC(year, month - 1, day - 1))
  const yesterday = yDay.toLocaleDateString('en-CA', { timeZone: 'UTC' })

  const todayJs = new Date(today + 'T12:00:00')
  const dow = todayJs.getDay()
  const daysToMon = dow === 0 ? 6 : dow - 1
  const weekStartJs = new Date(todayJs)
  weekStartJs.setDate(todayJs.getDate() - daysToMon)
  const weekStart = weekStartJs.toLocaleDateString('en-CA', { timeZone: 'UTC' })

  // Fetch from earliest needed date (include prev period for date filter)
  const fetchFrom = [prevPeriodStart, periodStart, weekStart].sort()[0]

  const [
    { data: employees },
    { data: entries },
    { data: edits },
    { data: approvedOt },
    { data: leaveData },
  ] = await Promise.all([
    supabaseAdmin.from('employees').select('id, name, work_email, role').eq('status', 'active').order('name'),
    supabaseAdmin.from('time_entries').select('*').gte('date', fetchFrom).lte('date', today).order('date', { ascending: false }),
    supabaseAdmin.from('audit_log').select('*').eq('action', 'time_entry_edited').order('performed_at', { ascending: false }).limit(100),
    supabaseAdmin.from('ot_requests').select('employee_id, date, ot_hours').eq('status', 'approved').gte('date', periodStart).lte('date', periodEnd),
    supabaseAdmin.from('leave_requests').select('employee_id, start_date, end_date, days_requested, leave_type, status').gte('start_date', prevPeriodStart).lte('end_date', periodEnd),
  ])

  // Build approved OT map: employee_id → total approved OT hours this period
  const approvedOtMap: Record<string, number> = {}
  for (const r of approvedOt ?? []) {
    approvedOtMap[r.employee_id] = (approvedOtMap[r.employee_id] ?? 0) + (r.ot_hours ?? 0)
  }

  // Build PTO map for current period: employee_id → { paidDays, unpaidDays }
  const ptoPaidMap: Record<string, number> = {}
  const ptoUnpaidMap: Record<string, number> = {}
  for (const r of leaveData ?? []) {
    if (r.status === 'approved' && r.start_date <= periodEnd && r.end_date >= periodStart) {
      if (r.leave_type === 'unpaid') {
        ptoUnpaidMap[r.employee_id] = (ptoUnpaidMap[r.employee_id] ?? 0) + (r.days_requested ?? 0)
      } else {
        ptoPaidMap[r.employee_id] = (ptoPaidMap[r.employee_id] ?? 0) + (r.days_requested ?? 0)
      }
    }
  }

  // Full leave request list for per-date missing hours calculation in detail views
  type LeaveRow = { employee_id: string; start_date: string; end_date: string; leave_type: string | null; status: string; days_requested: number }
  const allLeaveRequests: LeaveRow[] = (leaveData ?? []) as LeaveRow[]

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Team Time</h1>
        <p className="page-subtitle">Pay period: {periodStart} → {periodEnd} · All times in PST</p>
      </div>
      <AdminTimeView
        employees={employees ?? []}
        entries={entries ?? []}
        edits={edits ?? []}
        today={today}
        yesterday={yesterday}
        weekStart={weekStart}
        periodStart={periodStart}
        periodEnd={periodEnd}
        prevPeriodStart={prevPeriodStart}
        prevPeriodEnd={prevPeriodEnd}
        approvedOtMap={approvedOtMap}
        ptoPaidMap={ptoPaidMap}
        ptoUnpaidMap={ptoUnpaidMap}
        allLeaveRequests={allLeaveRequests}
      />
    </div>
  )
}
