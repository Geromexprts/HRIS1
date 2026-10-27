'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { leaveTypeLabel } from '@/lib/countries'

const LA_TZ = 'America/Los_Angeles'
const STANDARD_MONTHLY_HOURS = 173.33

type Emp = {
  id: string; name: string; work_email: string; employee_code: string | null
  role: string; status: string; employment_type: string | null
  employment_start_date: string | null; employment_end_date: string | null
  office_location: string | null
  monthly_salary: number | null; hourly_rate: number | null
  shift_schedule: string | null
  payslip_delivery: string | null
  date_of_birth: string | null
  home_address: string | null
  personal_email: string | null
  mobile_number: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  early_clock_in: boolean
  no_break_deduction: boolean
}
type TimeEntry = {
  id: string; date: string; clock_in: string | null; clock_out: string | null
  total_hours: number | null; is_edited: boolean
}
type LeaveRequest = {
  id: string; leave_type: string | null; start_date: string; end_date: string
  days_requested: number; status: string; created_at: string
  reason: string | null; is_half_day: boolean; approver_note: string | null
  reviewed_by: string | null
}
type AuditEntry = {
  id: string; action: string; details: Record<string, unknown>; performed_at: string
}
type DeductionRow = {
  pto_days_used: number; shortfall_days: number; shortfall_deduction: number; net_pay: number
} | null
type PayslipRow = {
  id: string; pay_period_start: string; pay_period_end: string
  monthly_salary: number | null; daily_rate: number | null
  leave_days: number | null; pto_days_used: number | null
  shortfall_days: number | null; shortfall_deduction: number | null; net_pay: number | null
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'badge-amber', approved: 'badge-green', denied: 'badge-red',
}

function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: LA_TZ })
}
function fmtH(h: number | null) {
  if (h == null) return '—'
  const hrs = Math.floor(h); const mins = Math.round((h - hrs) * 60)
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`
}
function tenure(startDate: string): string {
  const ms = Date.now() - new Date(startDate + 'T12:00:00').getTime()
  const months = Math.floor(ms / (1000 * 60 * 60 * 24 * 30.44))
  if (months < 1) return 'Less than a month'
  if (months < 12) return `${months} month${months !== 1 ? 's' : ''}`
  const years = Math.floor(months / 12); const rem = months % 12
  return rem > 0 ? `${years}y ${rem}m` : `${years} year${years !== 1 ? 's' : ''}`
}
function fmtMoney(n: number | null) {
  if (n == null) return '—'
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function utcToLAInput(iso: string): string {
  const d = new Date(iso)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: LA_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d)
  const get = (t: string) => parts.find(p => p.type === t)!.value
  const h = get('hour') === '24' ? '00' : get('hour')
  return `${get('year')}-${get('month')}-${get('day')}T${h}:${get('minute')}`
}
function laInputToUTC(localStr: string): string {
  const [datePart, timePart] = localStr.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hours, minutes] = timePart.split(':').map(Number)
  for (const offsetH of [7, 8]) {
    const candidate = new Date(Date.UTC(year, month - 1, day, hours + offsetH, minutes))
    if (utcToLAInput(candidate.toISOString()) === localStr) return candidate.toISOString()
  }
  return new Date(Date.UTC(year, month - 1, day, hours + 7, minutes)).toISOString()
}

export function EmployeeProfileView({ emp, managerName, approverName, pto, leaveRequests, timeEntries, deductionRow, auditLog, payslipHistory, periodStart, periodEnd, approvedOtHours = 0 }: {
  emp: Emp
  managerName: string | null
  approverName: string | null
  pto: number
  leaveRequests: LeaveRequest[]
  timeEntries: TimeEntry[]
  deductionRow: DeductionRow
  auditLog: AuditEntry[]
  payslipHistory: PayslipRow[]
  periodStart: string
  periodEnd: string
  approvedOtHours?: number
}) {
  const [tab, setTab] = useState<'overview' | 'time' | 'leave' | 'payroll' | 'audit'>('overview')
  const [leaveStatus, setLeaveStatus] = useState<'all' | 'pending' | 'approved' | 'denied'>('all')
  const [earlyClockIn, setEarlyClockIn] = useState(emp.early_clock_in)
  const [toggling, setToggling] = useState(false)
  const [noBreakDeduction, setNoBreakDeduction] = useState(emp.no_break_deduction)
  const [togglingBreak, setTogglingBreak] = useState(false)
  const [empType, setEmpType] = useState(emp.employment_type ?? 'full-time')
  const [empEndDate, setEmpEndDate] = useState(emp.employment_end_date ?? '')
  const [empSalary, setEmpSalary] = useState<number | null>(emp.monthly_salary)
  const [empHourlyRate, setEmpHourlyRate] = useState<number | null>(emp.hourly_rate)
  const [empEditField, setEmpEditField] = useState<string | null>(null)
  const [empEditVal, setEmpEditVal] = useState('')
  const [empSaving, setEmpSaving] = useState(false)
  const [empError, setEmpError] = useState('')
  const [otUnlocks, setOtUnlocks] = useState<{ id: string; date: string }[]>([])
  const [otUnlockDate, setOtUnlockDate] = useState('')
  const [otUnlockSaving, setOtUnlockSaving] = useState(false)
  const [otUnlockError, setOtUnlockError] = useState('')
  const [entries, setEntries] = useState<TimeEntry[]>(timeEntries)
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null)
  const [editClockIn, setEditClockIn] = useState('')
  const [editClockOut, setEditClockOut] = useState('')
  const [editReason, setEditReason] = useState('')
  const [editSkipBreak, setEditSkipBreak] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [addDate, setAddDate] = useState('')
  const [addClockIn, setAddClockIn] = useState('')
  const [addClockOut, setAddClockOut] = useState('')
  const [addNote, setAddNote] = useState('')
  const [addSkipBreak, setAddSkipBreak] = useState(false)
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState('')

  async function saveEmpField(field: string, value: unknown) {
    setEmpSaving(true)
    setEmpError('')
    try {
      const res = await fetch(`/api/admin/employees/${emp.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value === '' ? null : value }),
      })
      if (!res.ok) {
        const d = await res.json()
        setEmpError(d.error ?? 'Save failed')
      } else {
        const d = await res.json()
        if (field === 'employment_type') setEmpType(d.employment_type ?? 'full-time')
        if (field === 'employment_end_date') setEmpEndDate(d.employment_end_date ?? '')
        if (field === 'monthly_salary') setEmpSalary(d.monthly_salary)
        if (field === 'hourly_rate') setEmpHourlyRate(d.hourly_rate)
        setEmpEditField(null)
      }
    } catch {
      setEmpError('Network error')
    }
    setEmpSaving(false)
  }

  useEffect(() => {
    fetch(`/api/admin/ot-unlock?employee_id=${emp.id}`)
      .then(r => r.ok ? r.json() : [])
      .then(d => Array.isArray(d) ? setOtUnlocks(d) : null)
      .catch(() => null)
  }, [emp.id])

  async function addOtUnlock() {
    if (!otUnlockDate) return
    setOtUnlockSaving(true)
    setOtUnlockError('')
    try {
      const res = await fetch('/api/admin/ot-unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: emp.id, date: otUnlockDate }),
      })
      const d = await res.json()
      if (!res.ok) { setOtUnlockError(d.error ?? 'Failed'); }
      else { setOtUnlocks(prev => [...prev.filter(u => u.date !== d.date), d]); setOtUnlockDate('') }
    } catch { setOtUnlockError('Network error') }
    setOtUnlockSaving(false)
  }

  async function revokeOtUnlock(date: string) {
    await fetch('/api/admin/ot-unlock', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_id: emp.id, date }),
    })
    setOtUnlocks(prev => prev.filter(u => u.date !== date))
  }

  function openAddModal() {
    setAddDate('')
    setAddClockIn('')
    setAddClockOut('')
    setAddNote('')
    setAddSkipBreak(noBreakDeduction)
    setAddError('')
    setShowAddModal(true)
  }

  async function saveAdd() {
    if (!addDate || !addClockIn) { setAddError('Date and clock-in are required.'); return }
    setAddSaving(true)
    setAddError('')
    try {
      const res = await fetch('/api/admin/time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: emp.id,
          date: addDate,
          clock_in: laInputToUTC(`${addDate}T${addClockIn}`),
          clock_out: addClockOut ? laInputToUTC(`${addDate}T${addClockOut}`) : null,
          edit_note: addNote || null,
          skip_break: addSkipBreak,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setAddError(data.error ?? 'Failed to add entry.')
      } else {
        setEntries(prev => [data, ...prev].sort((a, b) => b.date.localeCompare(a.date)))
        setShowAddModal(false)
      }
    } catch {
      setAddError('Network error')
    }
    setAddSaving(false)
  }

  function openEdit(e: TimeEntry) {
    setEditingEntry(e)
    setEditClockIn(e.clock_in ? utcToLAInput(e.clock_in) : '')
    setEditClockOut(e.clock_out ? utcToLAInput(e.clock_out) : '')
    setEditReason('')
    setEditSkipBreak(noBreakDeduction)
    setEditError('')
  }

  async function saveEdit() {
    if (!editingEntry) return
    setEditSaving(true)
    setEditError('')
    try {
      const res = await fetch('/api/admin/time', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entryId: editingEntry.id,
          clock_in: editClockIn ? laInputToUTC(editClockIn) : null,
          clock_out: editClockOut ? laInputToUTC(editClockOut) : null,
          edit_note: editReason || 'Admin correction',
          skip_break: editSkipBreak,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        setEditError(data.error ?? 'Save failed')
      } else {
        const updated = await res.json()
        setEntries(prev => prev.map(e => e.id === updated.id
          ? { ...e, clock_in: updated.clock_in, clock_out: updated.clock_out, total_hours: updated.total_hours, is_edited: true }
          : e
        ))
        setEditingEntry(null)
      }
    } catch {
      setEditError('Network error')
    }
    setEditSaving(false)
  }

  const totalHours = entries.reduce((s, e) => s + (e.total_hours ?? 0), 0)
  const otHours = approvedOtHours
  const regularHours = totalHours - otHours
  const daysPresent = entries.filter(e => e.clock_in).length
  const dailyRate = emp.monthly_salary ? (emp.monthly_salary / STANDARD_MONTHLY_HOURS) * 8 : null
  const isHourly = emp.employment_type === 'hourly'
  const effectiveHourlyRate = emp.hourly_rate ?? (emp.monthly_salary ? emp.monthly_salary / STANDARD_MONTHLY_HOURS : null)
  const hourlyRate = effectiveHourlyRate
  const netPay = isHourly && emp.hourly_rate
    ? Math.round(totalHours * emp.hourly_rate * 100) / 100
    : deductionRow?.net_pay ?? emp.monthly_salary
  const pendingLeave = leaveRequests.filter(r => r.status === 'pending')
  const approvedLeave = leaveRequests.filter(r => r.status === 'approved')

  const filteredLeave = leaveStatus === 'all' ? leaveRequests : leaveRequests.filter(r => r.status === leaveStatus)

  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'time', label: `Time Log (${entries.length})` },
    { id: 'leave', label: `Leave (${leaveRequests.length})` },
    { id: 'payroll', label: 'Payroll' },
    { id: 'audit', label: `Audit Trail (${auditLog.length})` },
  ] as const

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Stat bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-label">PTO Balance</div>
          <div className="stat-value" style={{ fontSize: 22, color: pto < 3 ? 'var(--amber)' : 'var(--green)' }}>
            {pto}<span className="stat-unit">days</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Period Hours</div>
          <div className="stat-value" style={{ fontSize: 22 }}>{fmtH(Math.round(totalHours * 10) / 10)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">OT This Period</div>
          <div className="stat-value" style={{ fontSize: 22, color: otHours > 0 ? 'var(--amber)' : 'var(--text-muted)' }}>{fmtH(Math.round(otHours * 10) / 10)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending Leave</div>
          <div className="stat-value" style={{ fontSize: 22, color: pendingLeave.length > 0 ? 'var(--amber)' : 'var(--text-muted)' }}>{pendingLeave.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Net Pay (Period)</div>
          <div className="stat-value" style={{ fontSize: 18, color: 'var(--green)' }}>
            {netPay != null ? `$${netPay.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—'}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 16 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`tab-btn ${tab === t.id ? 'active' : ''}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {tab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="card">
              <div className="card-title" style={{ marginBottom: 14 }}>Profile</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
                {[
                  { label: 'Full Name', value: emp.name },
                  { label: 'Work Email', value: emp.work_email },
                  { label: 'Employee Code', value: emp.employee_code ?? '—' },
                  { label: 'Office Location', value: emp.office_location ?? '—' },
                  { label: 'Role', value: emp.role },
                ].map(row => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{row.label}</span>
                    <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="card">
              <div className="card-title" style={{ marginBottom: 14 }}>Employment</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
                {/* Editable: Type */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Type</span>
                  {empEditField === 'employment_type' ? (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <select value={empEditVal} onChange={e => setEmpEditVal(e.target.value)} style={{ fontSize: 12, padding: '2px 6px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)' }}>
                        {['full-time', 'part-time', 'hourly', 'contractor'].map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                      <button disabled={empSaving} onClick={() => saveEmpField('employment_type', empEditVal)} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Save</button>
                      <button onClick={() => setEmpEditField(null)} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer' }}>✕</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontWeight: 500, color: 'var(--text-primary)', textTransform: 'capitalize' }}>{empType}</span>
                      <button onClick={() => { setEmpEditField('employment_type'); setEmpEditVal(empType); setEmpError('') }} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>Edit</button>
                    </div>
                  )}
                </div>
                {/* Editable: Monthly Salary */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Monthly Salary</span>
                  {empEditField === 'monthly_salary' ? (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input type="number" value={empEditVal} onChange={e => setEmpEditVal(e.target.value)} min={0} step={0.01} style={{ width: 100, fontSize: 12, padding: '2px 6px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)' }} />
                      <button disabled={empSaving} onClick={() => saveEmpField('monthly_salary', empEditVal ? parseFloat(empEditVal) : null)} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Save</button>
                      <button onClick={() => setEmpEditField(null)} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer' }}>✕</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontWeight: 500, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(empSalary)}</span>
                      <button onClick={() => { setEmpEditField('monthly_salary'); setEmpEditVal(empSalary != null ? String(empSalary) : ''); setEmpError('') }} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>Edit</button>
                    </div>
                  )}
                </div>
                {/* Editable: Hourly Rate */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Hourly Rate</span>
                  {empEditField === 'hourly_rate' ? (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input type="number" value={empEditVal} onChange={e => setEmpEditVal(e.target.value)} min={0} step={0.01} style={{ width: 100, fontSize: 12, padding: '2px 6px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)' }} />
                      <button disabled={empSaving} onClick={() => saveEmpField('hourly_rate', empEditVal ? parseFloat(empEditVal) : null)} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Save</button>
                      <button onClick={() => setEmpEditField(null)} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer' }}>✕</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontWeight: 500, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{empHourlyRate != null ? `$${empHourlyRate.toFixed(2)}/hr` : '—'}</span>
                      <button onClick={() => { setEmpEditField('hourly_rate'); setEmpEditVal(empHourlyRate != null ? String(empHourlyRate) : ''); setEmpError('') }} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>Edit</button>
                    </div>
                  )}
                </div>
                {/* Read-only rows */}
                {[
                  { label: 'Status', value: emp.status },
                  { label: 'Start Date', value: emp.employment_start_date ? fmtDate(emp.employment_start_date) : '—' },
                  { label: 'Tenure', value: emp.employment_start_date ? tenure(emp.employment_start_date) : '—' },
                  { label: 'Manager', value: managerName ?? '—' },
                  { label: 'Approver', value: approverName ?? '—' },
                  { label: 'Shift', value: emp.shift_schedule ?? '—' },
                ].map(row => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{row.label}</span>
                    <span style={{ fontWeight: 500, color: 'var(--text-primary)', textTransform: 'capitalize' }}>{row.value}</span>
                  </div>
                ))}
                {/* Editable: End Date */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)' }}>End Date</span>
                  {empEditField === 'employment_end_date' ? (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input type="date" value={empEditVal} onChange={e => setEmpEditVal(e.target.value)} style={{ fontSize: 12, padding: '2px 6px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)' }} />
                      <button disabled={empSaving} onClick={() => saveEmpField('employment_end_date', empEditVal || null)} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Save</button>
                      <button onClick={() => setEmpEditField(null)} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer' }}>✕</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{empEndDate ? fmtDate(empEndDate) : '—'}</span>
                      <button onClick={() => { setEmpEditField('employment_end_date'); setEmpEditVal(empEndDate); setEmpError('') }} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>Edit</button>
                    </div>
                  )}
                </div>
                {empError && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>{empError}</div>}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Early Clock-In</span>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>Allow before 8:00 AM PST</div>
                  </div>
                  <button
                    disabled={toggling}
                    onClick={async () => {
                      setToggling(true)
                      const res = await fetch(`/api/admin/employees/${emp.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ early_clock_in: !earlyClockIn }),
                      })
                      if (res.ok) setEarlyClockIn(v => !v)
                      setToggling(false)
                    }}
                    style={{
                      width: 44, height: 24, borderRadius: 12, border: 'none', cursor: toggling ? 'wait' : 'pointer',
                      background: earlyClockIn ? 'var(--accent)' : 'var(--border)',
                      position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                    }}
                    title={earlyClockIn ? 'Click to disable early clock-in' : 'Click to allow early clock-in'}
                  >
                    <span style={{
                      position: 'absolute', top: 3, left: earlyClockIn ? 23 : 3,
                      width: 18, height: 18, borderRadius: '50%', background: '#fff',
                      transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }} />
                  </button>
                </div>
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Skip Break Deduction</span>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>No 1-hour auto-deduction on clock-out</div>
                  </div>
                  <button
                    disabled={togglingBreak}
                    onClick={async () => {
                      setTogglingBreak(true)
                      const res = await fetch(`/api/admin/employees/${emp.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ no_break_deduction: !noBreakDeduction }),
                      })
                      if (res.ok) setNoBreakDeduction(v => !v)
                      setTogglingBreak(false)
                    }}
                    style={{
                      width: 44, height: 24, borderRadius: 12, border: 'none', cursor: togglingBreak ? 'wait' : 'pointer',
                      background: noBreakDeduction ? 'var(--accent)' : 'var(--border)',
                      position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                    }}
                    title={noBreakDeduction ? 'Click to re-enable break deduction' : 'Click to skip break deduction'}
                  >
                    <span style={{
                      position: 'absolute', top: 3, left: noBreakDeduction ? 23 : 3,
                      width: 18, height: 18, borderRadius: '50%', background: '#fff',
                      transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }} />
                  </button>
                </div>
              </div>
            </div>
          </div>
          {(emp.date_of_birth || emp.home_address || emp.personal_email || emp.mobile_number || emp.emergency_contact_name || emp.emergency_contact_phone) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="card">
                <div className="card-title" style={{ marginBottom: 14 }}>Personal Details</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
                  {[
                    { label: 'Date of Birth', value: emp.date_of_birth ? fmtDate(emp.date_of_birth) : null },
                    { label: 'Personal Email', value: emp.personal_email },
                    { label: 'Mobile Number', value: emp.mobile_number },
                    { label: 'Home Address', value: emp.home_address },
                  ].filter(r => r.value).map(row => (
                    <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                      <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{row.label}</span>
                      <span style={{ fontWeight: 500, color: 'var(--text-primary)', textAlign: 'right', wordBreak: 'break-word' }}>{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card">
                <div className="card-title" style={{ marginBottom: 14 }}>Emergency Contact</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
                  {[
                    { label: 'Name & Relationship', value: emp.emergency_contact_name },
                    { label: 'Mobile Number', value: emp.emergency_contact_phone },
                  ].filter(r => r.value).map(row => (
                    <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-muted)' }}>{row.label}</span>
                      <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{row.value}</span>
                    </div>
                  ))}
                  {!emp.emergency_contact_name && !emp.emergency_contact_phone && (
                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Not provided</span>
                  )}
                </div>
              </div>
            </div>
          )}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 14 }}>Payroll — Current Period</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, fontSize: 13 }}>
              {[
                { label: 'Monthly Salary', value: isHourly ? '— (hourly)' : fmtMoney(emp.monthly_salary) },
                { label: 'Daily Rate', value: isHourly ? '— (hourly)' : (dailyRate != null ? `$${dailyRate.toFixed(2)}` : '—') },
                { label: 'Hourly Rate', value: emp.hourly_rate != null ? `$${emp.hourly_rate.toFixed(2)} (set)` : (hourlyRate != null ? `$${hourlyRate.toFixed(2)} (derived)` : '—') },
                { label: 'Total Hours', value: fmtH(Math.round(totalHours * 10) / 10) },
                { label: 'Regular Hours', value: fmtH(Math.round(regularHours * 10) / 10) },
                { label: 'OT Hours', value: fmtH(Math.round(otHours * 10) / 10) },
                { label: 'PTO Used', value: deductionRow?.pto_days_used != null ? `${deductionRow.pto_days_used} days` : '—' },
                { label: isHourly ? 'Est. Gross' : 'Net Pay', value: netPay != null ? fmtMoney(netPay) : '—' },
              ].map(row => (
                <div key={row.label}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{row.label}</div>
                  <div style={{ fontSize: 15, fontWeight: row.label === 'Net Pay' ? 700 : 500, color: row.label === 'Net Pay' ? 'var(--green)' : row.label === 'Pay Deduction' && row.value !== '—' ? 'var(--red)' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{row.value}</div>
                </div>
              ))}
            </div>
          </div>
          {/* OT Date Unlocks */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 4 }}>OT Past-Date Unlocks</div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              Allow this employee to file overtime for a specific past date. Unlocks are one-time — they can be revoked once used.
            </p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: otUnlocks.length > 0 ? 12 : 0 }}>
              <input
                type="date"
                value={otUnlockDate}
                onChange={e => setOtUnlockDate(e.target.value)}
                style={{ fontSize: 12, padding: '4px 8px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)' }}
              />
              <button
                disabled={!otUnlockDate || otUnlockSaving}
                onClick={addOtUnlock}
                style={{ fontSize: 12, padding: '5px 12px', borderRadius: 5, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontWeight: 600, opacity: !otUnlockDate ? 0.5 : 1 }}
              >
                {otUnlockSaving ? 'Saving…' : 'Unlock Date'}
              </button>
              {otUnlockError && <span style={{ fontSize: 12, color: 'var(--red)' }}>{otUnlockError}</span>}
            </div>
            {otUnlocks.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {otUnlocks.map(u => (
                  <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '3px 8px 3px 10px', borderRadius: 20, border: '1px solid var(--border)', background: 'color-mix(in srgb, var(--amber) 10%, var(--surface))' }}>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{u.date}</span>
                    <button onClick={() => revokeOtUnlock(u.date)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 11, padding: '0 2px', lineHeight: 1 }} title="Revoke unlock">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <Link href="/dashboard/admin/employees" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>← All Employees</Link>
            <Link href={`/dashboard/admin/employees/${emp.id}`} onClick={() => setTab('audit')} style={{ fontSize: 12, color: 'var(--text-muted)', textDecoration: 'none' }}>View Audit Trail →</Link>
          </div>
        </div>
      )}

      {/* ── Time Log ── */}
      {tab === 'time' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Time Log</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {periodStart} → {periodEnd} · {daysPresent} days · {fmtH(Math.round(totalHours * 10) / 10)} total
              </div>
              <button onClick={openAddModal} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>
                + Add Entry
              </button>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th><th>Clock In</th><th>Clock Out</th><th>Hours</th><th>OT</th><th>Missing</th><th>Note</th><th></th>
                </tr>
              </thead>
              <tbody>
                {entries.length === 0
                  ? <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 16px' }}>No time entries this period.</td></tr>
                  : entries.map(e => {
                    const ot = e.total_hours != null ? Math.max(0, e.total_hours - 8) : 0
                    const hasPaidPto = leaveRequests.some(lr =>
                      lr.status === 'approved' && lr.leave_type !== 'unpaid' &&
                      lr.start_date <= e.date && lr.end_date >= e.date
                    )
                    const cappedH = Math.min(e.total_hours ?? 0, 8)
                    const missing = hasPaidPto ? 0 : Math.max(0, 8 - cappedH)
                    return (
                      <tr key={e.id}>
                        <td style={{ fontSize: 12.5 }}>{fmtDate(e.date)}</td>
                        <td style={{ fontSize: 12.5 }}>{e.clock_in ? fmtTime(e.clock_in) : '—'}</td>
                        <td style={{ fontSize: 12.5 }}>{e.clock_out ? fmtTime(e.clock_out) : <span className="badge badge-amber">Missing</span>}</td>
                        <td style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: (e.total_hours ?? 0) > 8 ? 'var(--amber)' : 'var(--text-primary)' }}>{fmtH(e.total_hours)}</td>
                        <td style={{ fontVariantNumeric: 'tabular-nums', color: ot > 0 ? 'var(--amber)' : 'var(--text-muted)', fontWeight: ot > 0 ? 600 : 400 }}>{ot > 0 ? `+${fmtH(ot)}` : '—'}</td>
                        <td style={{ fontVariantNumeric: 'tabular-nums', color: missing > 0 ? 'var(--red)' : hasPaidPto ? 'var(--green)' : 'var(--text-muted)', fontWeight: missing > 0 ? 600 : 400, fontSize: 12.5 }}>
                          {missing > 0 ? fmtH(missing) : hasPaidPto ? 'PTO' : '—'}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{e.is_edited ? 'edited' : '—'}</td>
                        <td>
                          <button
                            onClick={() => openEdit(e)}
                            style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--accent)', cursor: 'pointer', fontWeight: 600 }}
                          >Edit</button>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Leave ── */}
      {tab === 'leave' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div className="card-title" style={{ marginBottom: 0, flex: 1 }}>Leave History</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {approvedLeave.length} approved · {pendingLeave.length} pending
            </div>
            <div className="tabs" style={{ marginBottom: 0 }}>
              {(['all', 'pending', 'approved', 'denied'] as const).map(s => (
                <button key={s} onClick={() => setLeaveStatus(s)} className={`tab-btn ${leaveStatus === s ? 'active' : ''}`} style={{ fontSize: 12, textTransform: 'capitalize' }}>
                  {s === 'all' ? `All (${leaveRequests.length})` : `${s.charAt(0).toUpperCase() + s.slice(1)} (${leaveRequests.filter(r => r.status === s).length})`}
                </button>
              ))}
            </div>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Type</th><th>Period</th><th>Days</th><th>Status</th><th>Submitted</th><th>Reason</th><th>Approver Note</th></tr>
              </thead>
              <tbody>
                {filteredLeave.length === 0
                  ? <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 16px' }}>No leave requests.</td></tr>
                  : filteredLeave.map(r => (
                    <tr key={r.id}>
                      <td><span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, fontWeight: 700, background: 'var(--accent-soft)', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{leaveTypeLabel(r.leave_type ?? 'pto')}</span></td>
                      <td style={{ fontSize: 12.5 }}>
                        {fmtDate(r.start_date)}{r.start_date !== r.end_date ? ` → ${fmtDate(r.end_date)}` : ''}
                        {r.is_half_day && <span className="badge badge-blue" style={{ marginLeft: 6 }}>Half</span>}
                      </td>
                      <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{r.days_requested}</td>
                      <td><span className={`badge ${STATUS_BADGE[r.status] ?? 'badge-gray'}`}>{r.status}</span></td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 180 }}>{r.reason ?? '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 180 }}>{r.approver_note ?? '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Payroll / Payslips ── */}
      {tab === 'payroll' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {payslipHistory.length === 0 ? (
            <div className="card">
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No payroll records found. Records are created when leave is approved for this employee.</p>
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="card-title" style={{ marginBottom: 0 }}>Payroll History</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sorted by period, newest first</div>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Pay Period</th>
                      <th>Monthly Salary</th>
                      <th>Leave Days</th>
                      <th>PTO Used</th>
                      <th>Deduction Days</th>
                      <th>Pay Deduction</th>
                      <th>Net Pay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payslipHistory.map(p => (
                      <tr key={p.id}>
                        <td style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
                          {p.pay_period_start} → {p.pay_period_end}
                        </td>
                        <td style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(p.monthly_salary)}</td>
                        <td style={{ fontVariantNumeric: 'tabular-nums', color: (p.leave_days ?? 0) > 0 ? 'var(--amber)' : 'var(--text-muted)' }}>{p.leave_days ?? 0} days</td>
                        <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>{p.pto_days_used ?? 0} days</td>
                        <td style={{ fontVariantNumeric: 'tabular-nums', color: (p.shortfall_days ?? 0) > 0 ? 'var(--red)' : 'var(--text-muted)' }}>{(p.shortfall_days ?? 0) > 0 ? `${p.shortfall_days} days` : '—'}</td>
                        <td style={{ fontVariantNumeric: 'tabular-nums', color: (p.shortfall_deduction ?? 0) > 0 ? 'var(--red)' : 'var(--text-muted)' }}>{(p.shortfall_deduction ?? 0) > 0 ? `-$${p.shortfall_deduction!.toFixed(2)}` : '—'}</td>
                        <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: p.net_pay != null ? 'var(--green)' : 'var(--text-muted)' }}>{fmtMoney(p.net_pay)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Audit Trail ── */}
      {tab === 'audit' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)' }}>
            <div className="card-title" style={{ marginBottom: 2 }}>Audit Trail</div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>All changes to this employee&apos;s record</p>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Action</th><th>Details</th><th>When</th></tr>
              </thead>
              <tbody>
                {auditLog.length === 0
                  ? <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 16px' }}>No audit records.</td></tr>
                  : auditLog.map(a => (
                    <tr key={a.id}>
                      <td style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{a.action.replace(/_/g, ' ')}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {Object.entries(a.details).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {new Date(a.performed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: LA_TZ })}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Add Time Entry Modal ── */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setShowAddModal(false) }}>
          <div className="card" style={{ width: '100%', maxWidth: 420, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Add Past Time Entry</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>Date</label>
                <input
                  type="date"
                  value={addDate}
                  onChange={e => setAddDate(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>Clock In (LA time)</label>
                  <input
                    type="time"
                    value={addClockIn}
                    onChange={e => setAddClockIn(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>Clock Out <span style={{ color: 'var(--text-muted)', textTransform: 'none', fontWeight: 400 }}>(optional)</span></label>
                  <input
                    type="time"
                    value={addClockOut}
                    onChange={e => setAddClockOut(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }}
                  />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>Note <span style={{ color: 'var(--text-muted)', textTransform: 'none', fontWeight: 400 }}>(optional)</span></label>
                <input
                  type="text"
                  placeholder="e.g. employee forgot to clock in"
                  value={addNote}
                  onChange={e => setAddNote(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                <input type="checkbox" checked={addSkipBreak} onChange={e => setAddSkipBreak(e.target.checked)} />
                <span>Skip lunch break deduction</span>
              </label>
            </div>
            {addError && <p style={{ fontSize: 12, color: 'var(--red)', margin: 0 }}>{addError}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAddModal(false)} style={{ fontSize: 13, padding: '7px 16px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={saveAdd} disabled={addSaving} style={{ fontSize: 13, padding: '7px 16px', borderRadius: 7, border: 'none', background: 'var(--accent)', color: '#fff', cursor: addSaving ? 'wait' : 'pointer', fontWeight: 600, opacity: addSaving ? 0.7 : 1 }}>
                {addSaving ? 'Adding…' : 'Add Entry'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Time Entry Modal ── */}
      {editingEntry && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setEditingEntry(null) }}>
          <div className="card" style={{ width: '100%', maxWidth: 420, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="card-title" style={{ marginBottom: 0 }}>Edit Time Entry</div>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtDate(editingEntry.date)}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>Clock In (LA time)</label>
                <input
                  type="datetime-local"
                  value={editClockIn}
                  onChange={e => setEditClockIn(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>Clock Out (LA time)</label>
                <input
                  type="datetime-local"
                  value={editClockOut}
                  onChange={e => setEditClockOut(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>Reason</label>
                <input
                  type="text"
                  placeholder="Admin correction"
                  value={editReason}
                  onChange={e => setEditReason(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                <input type="checkbox" checked={editSkipBreak} onChange={e => setEditSkipBreak(e.target.checked)} />
                <span>Skip lunch break deduction</span>
              </label>
            </div>
            {editError && <p style={{ fontSize: 12, color: 'var(--red)', margin: 0 }}>{editError}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setEditingEntry(null)} style={{ fontSize: 13, padding: '7px 16px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={saveEdit} disabled={editSaving} style={{ fontSize: 13, padding: '7px 16px', borderRadius: 7, border: 'none', background: 'var(--accent)', color: '#fff', cursor: editSaving ? 'wait' : 'pointer', fontWeight: 600, opacity: editSaving ? 0.7 : 1 }}>
                {editSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
