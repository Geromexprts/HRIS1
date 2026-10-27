import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { laPeriodBounds } from '@/lib/dates'
import Link from 'next/link'

function genDays(from: string, to: string): string[] {
  const days: string[] = []
  const d = new Date(from + 'T12:00:00Z')
  const end = new Date(to + 'T12:00:00Z')
  while (d <= end) {
    days.push(d.toISOString().split('T')[0])
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return days
}

function isBusinessDay(d: string): boolean {
  const dow = new Date(d + 'T12:00:00Z').getUTCDay()
  return dow !== 0 && dow !== 6
}

function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

function fmtH(h: number) {
  const hrs = Math.floor(h)
  const mins = Math.round((h - hrs) * 60)
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`
}

export default async function MissingHoursPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ periodStart?: string; periodEnd?: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (session.user.role !== 'admin') redirect('/dashboard')

  const { id } = await params
  const sp = await searchParams

  const { periodStart: currentStart, periodEnd: currentEnd } = laPeriodBounds()
  const periodStart = sp.periodStart ?? currentStart
  const periodEnd = sp.periodEnd ?? currentEnd

  const [
    { data: emp },
    { data: timeEntries },
    { data: leaveRequests },
  ] = await Promise.all([
    supabaseAdmin
      .from('employees')
      .select('id, name, employment_start_date, employment_end_date')
      .eq('id', id)
      .single(),
    supabaseAdmin
      .from('time_entries')
      .select('date, total_hours, clock_in, clock_out')
      .eq('employee_id', id)
      .gte('date', periodStart)
      .lte('date', periodEnd),
    supabaseAdmin
      .from('leave_requests')
      .select('id, start_date, end_date, leave_type, status, days_requested')
      .eq('employee_id', id)
      .lte('start_date', periodEnd)
      .gte('end_date', periodStart),
  ])

  if (!emp) redirect('/dashboard/admin/employees')

  const entriesByDate: Record<string, { total_hours: number | null; clock_in: string | null; clock_out: string | null }> = {}
  for (const e of timeEntries ?? []) {
    entriesByDate[e.date] = e
  }

  type LeaveRow = { id: string; leave_type: string | null; status: string; days_requested: number }
  const leavesByDate: Record<string, LeaveRow[]> = {}
  for (const lr of leaveRequests ?? []) {
    const days = genDays(lr.start_date, lr.end_date)
    for (const d of days) {
      if (!leavesByDate[d]) leavesByDate[d] = []
      leavesByDate[d].push(lr as LeaveRow)
    }
  }

  const effectiveStart = emp.employment_start_date && emp.employment_start_date > periodStart
    ? emp.employment_start_date
    : periodStart
  const effectiveEnd = emp.employment_end_date && emp.employment_end_date < periodEnd
    ? emp.employment_end_date
    : periodEnd

  const rows = genDays(periodStart, periodEnd)
    .filter(d => isBusinessDay(d) && d >= effectiveStart && d <= effectiveEnd)
    .map(date => {
      const entry = entriesByDate[date]
      const leaves = leavesByDate[date] ?? []
      const approvedPaidLeave = leaves.find(l => l.status === 'approved' && l.leave_type !== 'unpaid')

      const regularHours = approvedPaidLeave
        ? 8
        : entry
          ? Math.min(entry.total_hours ?? 0, 8)
          : 0
      const missingHours = Math.max(0, 8 - regularHours)

      const reasons: string[] = []
      if (missingHours > 0) {
        if (!entry && leaves.length === 0) {
          reasons.push('No time entry')
        } else if (entry && (entry.total_hours ?? 0) < 8) {
          reasons.push(`Short: only ${fmtH(Math.min(entry.total_hours ?? 0, 8))} logged`)
        }
        for (const l of leaves) {
          if (l.status !== 'approved' || l.leave_type === 'unpaid') {
            const typeLabel = l.leave_type === 'unpaid' ? 'Unpaid PTO' : 'Paid PTO'
            const statusLabel = l.status === 'pending' ? '(Pending)' : l.status === 'denied' ? '(Denied)' : ''
            reasons.push(`${typeLabel}${statusLabel ? ' ' + statusLabel : ''}`)
          }
        }
      }

      return { date, entry, leaves, approvedPaidLeave, regularHours, missingHours, reasons }
    })
    .filter(r => r.missingHours > 0 || r.leaves.length > 0)

  const totalMissing = rows.reduce((s, r) => s + r.missingHours, 0)
  const missingDateCount = rows.filter(r => r.missingHours > 0).length

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link
            href={`/dashboard/admin/employees/${id}`}
            style={{ fontSize: 13, color: 'var(--text-muted)', textDecoration: 'none', fontWeight: 500 }}
          >
            ← {emp.name}
          </Link>
        </div>
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h1 className="page-title">Missing Hours Breakdown</h1>
            <p className="page-subtitle">
              {periodStart} → {periodEnd}
              {totalMissing > 0
                ? ` · ${fmtH(totalMissing)} missing across ${missingDateCount} day${missingDateCount !== 1 ? 's' : ''}`
                : ' · No missing hours'}
            </p>
          </div>
          {totalMissing > 0 && (
            <div className="stat-card" style={{ minWidth: 140 }}>
              <div className="stat-label">Total Missing</div>
              <div className="stat-value" style={{ fontSize: 22, color: 'var(--red)' }}>
                {fmtH(totalMissing)}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Expected</th>
                <th>Actual Hours</th>
                <th>PTO Request</th>
                <th>Missing</th>
                <th>Reason</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 16px' }}>
                    No missing hours or PTO requests found for this period.
                  </td>
                </tr>
              ) : rows.map(row => (
                <tr
                  key={row.date}
                  style={row.missingHours > 0
                    ? { background: 'color-mix(in srgb, var(--red) 4%, transparent)' }
                    : undefined}
                >
                  <td style={{ fontWeight: 600 }}>
                    {fmtDate(row.date)}
                  </td>
                  <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>8h</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {row.approvedPaidLeave ? (
                      <span style={{ color: 'var(--green)' }}>8h (Paid PTO)</span>
                    ) : row.entry ? (
                      <span style={{ color: (row.entry.total_hours ?? 0) < 8 ? 'var(--amber)' : 'var(--green)' }}>
                        {fmtH(Math.min(row.entry.total_hours ?? 0, 8))}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--red)' }}>—</span>
                    )}
                  </td>
                  <td>
                    {row.leaves.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {row.leaves.map((l, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5 }}>
                            <span style={{ color: l.leave_type === 'unpaid' ? 'var(--amber)' : 'var(--green)', fontWeight: 500 }}>
                              {l.leave_type === 'unpaid' ? 'Unpaid' : 'Paid'} PTO
                            </span>
                            <span className={`badge ${l.status === 'approved' ? 'badge-green' : l.status === 'pending' ? 'badge-amber' : 'badge-red'}`} style={{ fontSize: 10 }}>
                              {l.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
                    )}
                  </td>
                  <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: row.missingHours > 0 ? 'var(--red)' : 'var(--text-muted)' }}>
                    {row.missingHours > 0 ? fmtH(row.missingHours) : '—'}
                  </td>
                  <td style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                    {row.reasons.length > 0
                      ? row.reasons.join(' · ')
                      : row.approvedPaidLeave
                        ? 'Approved paid PTO'
                        : '—'}
                  </td>
                  <td>
                    <Link
                      href={`/dashboard/admin/employees/${id}`}
                      style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}
                    >
                      Time Log →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > 0 && (
          <div style={{ padding: '12px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {missingDateCount} date{missingDateCount !== 1 ? 's' : ''} with missing hours
              {rows.length > missingDateCount ? ` · ${rows.length - missingDateCount} PTO-only row${rows.length - missingDateCount !== 1 ? 's' : ''}` : ''}
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, color: totalMissing > 0 ? 'var(--red)' : 'var(--green)', fontVariantNumeric: 'tabular-nums' }}>
              Total Missing: {fmtH(totalMissing)}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
