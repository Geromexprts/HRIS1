'use client'

import { useState } from 'react'
import Link from 'next/link'

type Employee = {
  id: string
  name: string
  work_email: string
  office_location: string | null
  monthly_salary: number | null
  hourly_rate: number | null
  employment_type: string | null
  employment_end_date: string | null
  shift_schedule: string | null
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

type LocalIncentives = {
  intake_booking_incentive: number
  google_review_incentive: number
  performance_incentive: number
  referral_incentive: number
  reimbursements: number
}

type HoursMap = Record<string, number>
type LeaveMap = Record<string, number>
type PtoMap = Record<string, number>
type DeductionMap = Record<string, DeductionRow>

const STANDARD_MONTHLY_HOURS = 173.33

function countBusinessDays(from: string, to: string): number {
  const start = new Date(from + 'T12:00:00Z')
  const end = new Date(to + 'T12:00:00Z')
  if (end < start) return 0
  let count = 0
  const cur = new Date(start)
  while (cur <= end) {
    const dow = cur.getUTCDay()
    if (dow !== 0 && dow !== 6) count++
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return count
}

function computeNetPay(
  emp: Employee,
  coveredHours: number,
  approvedOtHours: number,
  paidPtoDays: number,
  workingDays: number,
  incentives: LocalIncentives,
): number | null {
  const incentivesTotal =
    (incentives.intake_booking_incentive ?? 0) +
    (incentives.google_review_incentive ?? 0) +
    (incentives.performance_incentive ?? 0) +
    (incentives.referral_incentive ?? 0) +
    (incentives.reimbursements ?? 0)

  if (emp.employment_type === 'hourly') {
    const rate = emp.hourly_rate
    if (rate == null) return null
    return Math.round(((coveredHours + approvedOtHours) * rate + incentivesTotal) * 100) / 100
  }

  const salary = emp.monthly_salary
  if (salary == null) return null
  const hourlyRate = salary / STANDARD_MONTHLY_HOURS
  const expectedHours = workingDays * 8
  const missingHours = Math.max(0, expectedHours - coveredHours - paidPtoDays * 8)
  return Math.round((salary - missingHours * hourlyRate + approvedOtHours * hourlyRate + incentivesTotal) * 100) / 100
}

function SalaryModal({ employee, onClose, onSaved }: {
  employee: Employee
  onClose: () => void
  onSaved: (updated: Employee) => void
}) {
  const [salary, setSalary] = useState<string>(employee.monthly_salary != null ? String(employee.monthly_salary) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    const value = salary !== '' ? parseFloat(salary) : null
    if (salary !== '' && (isNaN(value!) || value! < 0)) {
      setError('Enter a valid salary amount.')
      return
    }
    setSaving(true); setError('')
    const res = await fetch('/api/admin/employees', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: employee.id, monthly_salary: value }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Failed to save.'); setSaving(false); return }
    onSaved({ ...employee, monthly_salary: data.monthly_salary })
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 380 }}>
        <div className="modal-title">Set Monthly Salary</div>
        <div className="modal-sub">{employee.name}</div>
        <div style={{ marginBottom: 16 }}>
          <label className="field-label">Monthly Gross Salary</label>
          <input
            type="number"
            value={salary}
            onChange={e => setSalary(e.target.value)}
            className="field-input"
            placeholder="e.g. 50000"
            min="0"
            step="0.01"
            autoFocus
          />
          {salary !== '' && !isNaN(parseFloat(salary)) && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
              Daily rate: ${((parseFloat(salary) / STANDARD_MONTHLY_HOURS) * 8).toFixed(2)}
            </p>
          )}
        </div>
        {error && <p style={{ fontSize: 12.5, color: 'var(--red)', marginBottom: 12 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={handleSave} disabled={saving} className="btn btn-primary" style={{ flex: 1 }}>
            {saving ? 'Saving…' : 'Save Salary'}
          </button>
          <button onClick={onClose} className="btn btn-ghost">Cancel</button>
        </div>
      </div>
    </div>
  )
}

function IncentiveModal({ employee, coveredHours, approvedOtHours, paidPtoDays, workingDays, current, periodStart, periodEnd, periodLabel, onClose, onSaved }: {
  employee: Employee
  coveredHours: number
  approvedOtHours: number
  paidPtoDays: number
  workingDays: number
  current: LocalIncentives
  periodStart: string
  periodEnd: string
  periodLabel: string
  onClose: () => void
  onSaved: (empId: string, saved: LocalIncentives) => void
}) {
  const [fields, setFields] = useState<LocalIncentives>({ ...current })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const netPay = computeNetPay(employee, coveredHours, approvedOtHours, paidPtoDays, workingDays, fields)
  const incentivesTotal = Object.values(fields).reduce((s, v) => s + (v ?? 0), 0)

  function set(key: keyof LocalIncentives, val: string) {
    setFields(prev => ({ ...prev, [key]: val === '' ? 0 : parseFloat(val) || 0 }))
  }

  async function handleSave() {
    setSaving(true); setError('')
    const res = await fetch('/api/admin/payroll', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employee_id: employee.id,
        pay_period_start: periodStart,
        pay_period_end: periodEnd,
        ...fields,
        net_pay: netPay,
      }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Failed to save.'); setSaving(false); return }
    onSaved(employee.id, fields)
    onClose()
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 420 }}>
        <div className="modal-title">Incentives & Reimbursements</div>
        <div className="modal-sub">{employee.name} · {periodLabel}</div>

        {[
          { key: 'intake_booking_incentive' as const, label: 'Intake Booking Incentive' },
          { key: 'google_review_incentive' as const, label: 'Google Review Incentive' },
          { key: 'performance_incentive' as const, label: 'Performance Incentive' },
          { key: 'referral_incentive' as const, label: 'Referral Incentive' },
          { key: 'reimbursements' as const, label: 'Reimbursements' },
        ].map(({ key, label }) => (
          <div key={key} style={{ marginBottom: 12 }}>
            <label className="field-label">{label}</label>
            <input
              type="number"
              value={fields[key] || ''}
              onChange={e => set(key, e.target.value)}
              className="field-input"
              placeholder="0.00"
              min="0"
              step="0.01"
            />
          </div>
        ))}

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
            <span style={{ color: 'var(--text-muted)' }}>Total Incentives</span>
            <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
              ${incentivesTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
            <span style={{ color: 'var(--text-muted)' }}>Net Pay Preview</span>
            <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: netPay != null ? 'var(--green)' : 'var(--text-muted)' }}>
              {netPay != null ? `$${netPay.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
            </span>
          </div>
        </div>

        {error && <p style={{ fontSize: 12.5, color: 'var(--red)', marginBottom: 12 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={handleSave} disabled={saving} className="btn btn-primary" style={{ flex: 1 }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={onClose} className="btn btn-ghost">Cancel</button>
        </div>
      </div>
    </div>
  )
}

function defaultIncentives(d: DeductionRow): LocalIncentives {
  return {
    intake_booking_incentive: d?.intake_booking_incentive ?? 0,
    google_review_incentive: d?.google_review_incentive ?? 0,
    performance_incentive: d?.performance_incentive ?? 0,
    referral_incentive: d?.referral_incentive ?? 0,
    reimbursements: d?.reimbursements ?? 0,
  }
}

export function PayrollView({
  employees: initialEmployees,
  hoursMap,
  leaveMap,
  ptoMap,
  deductionMap,
  periodLabel,
  periodStart,
  periodEnd,
  approvedOtMap = {},
  ptoPaidMap = {},
  ptoUnpaidMap = {},
  workingDaysMap = {},
}: {
  employees: Employee[]
  hoursMap: HoursMap
  leaveMap: LeaveMap
  ptoMap: PtoMap
  deductionMap: DeductionMap
  periodLabel: string
  periodStart: string
  periodEnd: string
  approvedOtMap?: Record<string, number>
  ptoPaidMap?: Record<string, number>
  ptoUnpaidMap?: Record<string, number>
  workingDaysMap?: Record<string, number>
}) {
  const [employees, setEmployees] = useState(initialEmployees)
  const [salaryEmployee, setSalaryEmployee] = useState<Employee | null>(null)
  const [incentiveEmployee, setIncentiveEmployee] = useState<Employee | null>(null)
  const [localIncentives, setLocalIncentives] = useState<Record<string, LocalIncentives>>(() => {
    const init: Record<string, LocalIncentives> = {}
    for (const emp of initialEmployees) {
      init[emp.id] = defaultIncentives(deductionMap[emp.id] ?? null)
    }
    return init
  })

  function handleSalarySaved(updated: Employee) {
    setEmployees(prev => prev.map(e => e.id === updated.id ? updated : e))
    setSalaryEmployee(null)
  }

  function handleIncentivesSaved(empId: string, saved: LocalIncentives) {
    setLocalIncentives(prev => ({ ...prev, [empId]: saved }))
  }

  const totalLeave = employees.reduce((sum, e) => sum + (leaveMap[e.id] ?? 0), 0)
  const totalNetPay = employees.reduce((sum, e) => {
    const hours = hoursMap[e.id] ?? 0
    const otHrs = approvedOtMap[e.id] ?? 0
    const paidPto = ptoPaidMap[e.id] ?? 0
    const workDays = workingDaysMap[e.id] ?? 0
    const inc = localIncentives[e.id] ?? defaultIncentives(deductionMap[e.id] ?? null)
    const np = computeNetPay(e, hours, otHrs, paidPto, workDays, inc)
    return sum + (np ?? 0)
  }, 0)

  // Period progress
  const todayStr = new Date().toISOString().split('T')[0]
  const clampedToday = todayStr > periodEnd ? periodEnd : todayStr < periodStart ? periodStart : todayStr
  const totalPeriodDays = countBusinessDays(periodStart, periodEnd)
  const elapsedDays = countBusinessDays(periodStart, clampedToday)

  // Stat card totals
  const totalDeductions = employees.reduce((sum, e) => {
    if (e.employment_type === 'hourly') return sum
    const salary = e.monthly_salary
    if (salary == null) return sum
    const hourlyRate = salary / STANDARD_MONTHLY_HOURS
    const hours = hoursMap[e.id] ?? 0
    const paidPto = ptoPaidMap[e.id] ?? 0
    const workDays = workingDaysMap[e.id] ?? 0
    const missingHours = Math.max(0, workDays * 8 - hours - paidPto * 8)
    return sum + missingHours * hourlyRate
  }, 0)

  const totalOtPay = employees.reduce((sum, e) => {
    const otHrs = approvedOtMap[e.id] ?? 0
    if (otHrs <= 0) return sum
    if (e.employment_type === 'hourly') return sum + (e.hourly_rate ?? 0) * otHrs
    const salary = e.monthly_salary
    if (salary == null) return sum
    return sum + otHrs * (salary / STANDARD_MONTHLY_HOURS)
  }, 0)

  function exportCSV() {
    const headers = [
      'Name', 'Location', 'Schedule', 'Type', 'Monthly Salary', 'Hourly Rate',
      'Working Days', 'Expected Hours',
      'Days So Far', 'Expected So Far', 'Hours Worked',
      'Approved OT Hrs', 'Paid PTO Days', 'Unpaid TO Days', 'Missing Hours',
      'PTO Balance', 'PTO Used',
      'Base Pay', 'Deductions', 'OT Pay',
      'Intake Booking', 'Google Review', 'Performance', 'Referral', 'Reimbursements', 'Total Incentives',
      'Net Pay',
    ]
    const rows = employees.map(e => {
      const d = deductionMap[e.id]
      const inc = localIncentives[e.id] ?? defaultIncentives(d ?? null)
      const isHourly = e.employment_type === 'hourly'
      const hours = hoursMap[e.id] ?? 0
      const otHrs = approvedOtMap[e.id] ?? 0
      const paidPto = ptoPaidMap[e.id] ?? 0
      const unpaidPto = ptoUnpaidMap[e.id] ?? 0
      const workingDays = workingDaysMap[e.id] ?? 0
      const expectedHours = workingDays * 8
      const missingHours = Math.max(0, expectedHours - hours - paidPto * 8)
      const incentivesTotal = Object.values(inc).reduce((s, v) => s + (v ?? 0), 0)
      const netPay = computeNetPay(e, hours, otHrs, paidPto, workingDays, inc)
      const empElapsed = Math.min(elapsedDays, workingDays)
      const basePay = isHourly ? (e.hourly_rate ?? 0) * hours : (e.monthly_salary ?? 0)
      const deduction = isHourly ? 0 : e.monthly_salary != null ? missingHours * (e.monthly_salary / STANDARD_MONTHLY_HOURS) : 0
      const otPay = isHourly
        ? otHrs * (e.hourly_rate ?? 0)
        : e.monthly_salary != null ? otHrs * (e.monthly_salary / STANDARD_MONTHLY_HOURS) : 0
      return [
        e.name,
        e.office_location ?? '',
        e.shift_schedule ?? '',
        e.employment_type ?? 'salaried',
        e.monthly_salary ?? '',
        e.hourly_rate ?? '',
        workingDays,
        expectedHours,
        empElapsed,
        empElapsed * 8,
        hours.toFixed(2),
        otHrs.toFixed(2),
        paidPto,
        unpaidPto,
        missingHours.toFixed(2),
        ptoMap[e.id] ?? 0,
        d?.pto_days_used ?? '',
        basePay.toFixed(2),
        deduction.toFixed(2),
        otPay.toFixed(2),
        inc.intake_booking_incentive,
        inc.google_review_incentive,
        inc.performance_incentive,
        inc.referral_incentive,
        inc.reimbursements,
        incentivesTotal.toFixed(2),
        netPay != null ? netPay.toFixed(2) : '',
      ]
    })
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `payroll-${periodLabel.replace(/\s/g, '-')}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const incentiveEmpData = incentiveEmployee ? {
    coveredHours: hoursMap[incentiveEmployee.id] ?? 0,
    approvedOtHours: approvedOtMap[incentiveEmployee.id] ?? 0,
    paidPtoDays: ptoPaidMap[incentiveEmployee.id] ?? 0,
    workingDays: workingDaysMap[incentiveEmployee.id] ?? 0,
    current: localIncentives[incentiveEmployee.id] ?? defaultIncentives(deductionMap[incentiveEmployee.id] ?? null),
  } : null

  const mtdBg = 'color-mix(in srgb, var(--accent) 7%, transparent)'
  const todayBg = 'color-mix(in srgb, var(--text-muted) 8%, transparent)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {salaryEmployee && (
        <SalaryModal
          employee={salaryEmployee}
          onClose={() => setSalaryEmployee(null)}
          onSaved={handleSalarySaved}
        />
      )}
      {incentiveEmployee && incentiveEmpData && (
        <IncentiveModal
          employee={incentiveEmployee}
          coveredHours={incentiveEmpData.coveredHours}
          approvedOtHours={incentiveEmpData.approvedOtHours}
          paidPtoDays={incentiveEmpData.paidPtoDays}
          workingDays={incentiveEmpData.workingDays}
          current={incentiveEmpData.current}
          periodStart={periodStart}
          periodEnd={periodEnd}
          periodLabel={periodLabel}
          onClose={() => setIncentiveEmployee(null)}
          onSaved={handleIncentivesSaved}
        />
      )}

      {/* 5 stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
        <div className="stat-card">
          <div className="stat-label">Active Staff</div>
          <div className="stat-value">{employees.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Period Progress</div>
          <div className="stat-value" style={{ fontSize: 22, color: 'var(--accent)' }}>
            {elapsedDays} <span className="stat-unit">of {totalPeriodDays}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            working days ({totalPeriodDays > 0 ? Math.round(elapsedDays / totalPeriodDays * 100) : 0}%)
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Deductions</div>
          <div className="stat-value" style={{ fontSize: 22, color: totalDeductions > 0 ? 'var(--red)' : 'var(--text-muted)' }}>
            {totalDeductions > 0 ? `−$${Math.round(totalDeductions).toLocaleString('en-US')}` : '—'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total OT Pay</div>
          <div className="stat-value" style={{ fontSize: 22, color: totalOtPay > 0 ? 'var(--accent)' : 'var(--text-muted)' }}>
            {totalOtPay > 0 ? `+$${Math.round(totalOtPay).toLocaleString('en-US')}` : '—'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Net Payroll</div>
          <div className="stat-value" style={{ fontSize: 22, color: 'var(--green)' }}>
            ${totalNetPay.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div className="card-title" style={{ marginBottom: 2 }}>Pay Period Summary</div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{periodLabel}</p>
          </div>
          <button onClick={exportCSV} className="btn btn-ghost" style={{ fontSize: 12.5 }}>
            Export CSV
          </button>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              {/* Column group labels */}
              <tr>
                <th colSpan={4} style={{ padding: '8px 12px', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textAlign: 'left', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', background: 'var(--bg-subtle, var(--border))' }}>
                  Employee
                </th>
                <th colSpan={2} style={{ padding: '8px 12px', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textAlign: 'left', borderBottom: '1px solid var(--border)', borderLeft: '1px solid var(--border)', color: 'var(--text-muted)', background: 'var(--bg-subtle, var(--border))' }}>
                  Full pay period
                </th>
                <th colSpan={3} style={{ padding: '8px 12px', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textAlign: 'left', borderBottom: '1px solid var(--border)', borderLeft: '1px solid var(--border)', background: mtdBg, color: 'var(--accent)' }}>
                  Month to date (completed days)
                </th>
                <th style={{ padding: '8px 12px', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textAlign: 'left', borderBottom: '1px solid var(--border)', background: todayBg, color: 'var(--text-muted)' }}>
                  Not counted yet
                </th>
                <th colSpan={5} style={{ padding: '8px 12px', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textAlign: 'left', borderBottom: '1px solid var(--border)', borderLeft: '1px solid var(--border)', color: 'var(--text-muted)', background: 'var(--bg-subtle, var(--border))' }}>
                  Time off and adjustments
                </th>
                <th colSpan={5} style={{ padding: '8px 12px', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textAlign: 'left', borderBottom: '1px solid var(--border)', borderLeft: '1px solid var(--border)', color: 'var(--text-muted)', background: 'var(--bg-subtle, var(--border))' }}>
                  Pay computation
                </th>
              </tr>
              {/* Column headers */}
              <tr>
                <th>Employee</th>
                <th>Location</th>
                <th>Schedule</th>
                <th>Salary / Rate</th>
                <th style={{ borderLeft: '1px solid var(--border)' }}>Working Days</th>
                <th>Expected Hrs</th>
                <th style={{ borderLeft: '1px solid var(--border)', background: mtdBg, color: 'var(--accent)' }}>Days So Far</th>
                <th style={{ background: mtdBg, color: 'var(--accent)' }}>Expected So Far</th>
                <th style={{ background: mtdBg, color: 'var(--accent)' }}>Hours Worked</th>
                <th style={{ background: todayBg }}>Today</th>
                <th style={{ borderLeft: '1px solid var(--border)' }}>Approved OT</th>
                <th>Paid PTO</th>
                <th>Unpaid TO</th>
                <th>Missing Hrs</th>
                <th>PTO Balance</th>
                <th style={{ borderLeft: '1px solid var(--border)' }}>Base Pay</th>
                <th>Deductions</th>
                <th>OT Pay</th>
                <th>Incentives</th>
                <th>Net Pay</th>
              </tr>
            </thead>
            <tbody>
              {employees.length === 0
                ? (
                  <tr>
                    <td colSpan={20} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 16px' }}>
                      No active employees.
                    </td>
                  </tr>
                )
                : employees.map(e => {
                  const isHourly = e.employment_type === 'hourly'
                  const d = deductionMap[e.id]
                  const inc = localIncentives[e.id] ?? defaultIncentives(d ?? null)
                  const totalHours = hoursMap[e.id] ?? 0
                  const approvedOtHours = approvedOtMap[e.id] ?? 0
                  const paidPtoDays = ptoPaidMap[e.id] ?? 0
                  const unpaidPtoDays = ptoUnpaidMap[e.id] ?? 0
                  const workingDays = workingDaysMap[e.id] ?? 0
                  const expectedHours = workingDays * 8
                  const missingHours = Math.max(0, expectedHours - totalHours - paidPtoDays * 8)
                  const pto = ptoMap[e.id] ?? 0
                  const netPay = computeNetPay(e, totalHours, approvedOtHours, paidPtoDays, workingDays, inc)
                  const incentivesTotal = Object.values(inc).reduce((s, v) => s + (v ?? 0), 0)
                  const hasSalary = isHourly ? e.hourly_rate != null : e.monthly_salary != null
                  const isTerminated = e.employment_end_date != null && e.employment_end_date <= periodEnd

                  const dailyRate = !isHourly && e.monthly_salary != null
                    ? (e.monthly_salary / STANDARD_MONTHLY_HOURS) * 8
                    : null

                  // MTD columns
                  const empElapsedDays = Math.min(elapsedDays, workingDays)
                  const expectedSoFar = empElapsedDays * 8

                  // Pay computation columns
                  const basePay: number | null = isHourly
                    ? (e.hourly_rate != null ? e.hourly_rate * totalHours : null)
                    : e.monthly_salary
                  const deduction: number | null = isHourly
                    ? 0
                    : e.monthly_salary != null ? missingHours * (e.monthly_salary / STANDARD_MONTHLY_HOURS) : null
                  const otPay: number | null = isHourly
                    ? approvedOtHours * (e.hourly_rate ?? 0)
                    : e.monthly_salary != null ? approvedOtHours * (e.monthly_salary / STANDARD_MONTHLY_HOURS) : null

                  return (
                    <tr key={e.id} style={isTerminated ? { background: 'color-mix(in srgb, var(--amber) 6%, transparent)' } : undefined}>
                      {/* Employee */}
                      <td style={{ fontWeight: 600 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Link href={`/dashboard/admin/employees/${e.id}`} style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
                            {e.name}
                          </Link>
                          {isTerminated && (
                            <span title={`End date: ${e.employment_end_date}`} style={{ fontSize: 11, background: 'var(--amber)', color: '#fff', borderRadius: 4, padding: '1px 5px', fontWeight: 600 }}>
                              TERM
                            </span>
                          )}
                        </div>
                      </td>
                      {/* Location */}
                      <td style={{ textTransform: 'capitalize', color: 'var(--text-muted)', fontSize: 12.5 }}>
                        {e.office_location ?? '—'}
                      </td>
                      {/* Schedule */}
                      <td style={{ color: 'var(--text-muted)', fontSize: 12.5 }}>
                        {e.shift_schedule ?? '—'}
                      </td>
                      {/* Salary / Rate */}
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {isHourly ? (
                          e.hourly_rate != null
                            ? <span style={{ fontSize: 12.5 }}>${e.hourly_rate.toFixed(2)}<span style={{ color: 'var(--text-muted)' }}>/hr</span></span>
                            : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>No rate</span>
                        ) : (
                          e.monthly_salary != null
                            ? `$${e.monthly_salary.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : (
                              <button
                                onClick={() => setSalaryEmployee(e)}
                                style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, padding: 0 }}
                              >
                                Set salary
                              </button>
                            )
                        )}
                        {!isHourly && e.monthly_salary != null && dailyRate != null && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                            ${(dailyRate / 8).toFixed(2)}/hr
                          </div>
                        )}
                      </td>
                      {/* Working Days */}
                      <td style={{ fontVariantNumeric: 'tabular-nums', textAlign: 'center', borderLeft: '1px solid var(--border)' }}>
                        {workingDays > 0 ? workingDays : '—'}
                      </td>
                      {/* Expected Hrs */}
                      <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)', textAlign: 'center' }}>
                        {expectedHours > 0 ? `${expectedHours}h` : '—'}
                      </td>
                      {/* Days So Far (MTD) */}
                      <td style={{ fontVariantNumeric: 'tabular-nums', textAlign: 'center', borderLeft: '1px solid var(--border)', background: mtdBg }}>
                        {empElapsedDays > 0 ? empElapsedDays : '—'}
                      </td>
                      {/* Expected So Far (MTD) */}
                      <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)', textAlign: 'center', background: mtdBg }}>
                        {expectedSoFar > 0 ? `${expectedSoFar}h` : '—'}
                      </td>
                      {/* Hours Worked (MTD) */}
                      <td style={{ fontVariantNumeric: 'tabular-nums', color: totalHours > 0 ? 'var(--text-primary)' : 'var(--text-muted)', background: mtdBg }}>
                        {totalHours > 0 ? totalHours.toFixed(1) : '—'}
                      </td>
                      {/* Today (not counted) */}
                      <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)', textAlign: 'center', background: todayBg }}>
                        —
                      </td>
                      {/* Approved OT */}
                      <td style={{ fontVariantNumeric: 'tabular-nums', color: approvedOtHours > 0 ? 'var(--accent)' : 'var(--text-muted)', borderLeft: '1px solid var(--border)' }}>
                        {approvedOtHours > 0 ? `+${approvedOtHours.toFixed(1)}` : '—'}
                      </td>
                      {/* Paid PTO */}
                      <td style={{ fontVariantNumeric: 'tabular-nums', color: paidPtoDays > 0 ? 'var(--amber)' : 'var(--text-muted)' }}>
                        {paidPtoDays > 0 ? `${paidPtoDays}d` : '—'}
                      </td>
                      {/* Unpaid TO */}
                      <td style={{ fontVariantNumeric: 'tabular-nums', color: unpaidPtoDays > 0 ? 'var(--red)' : 'var(--text-muted)' }}>
                        {unpaidPtoDays > 0 ? `${unpaidPtoDays}d` : '—'}
                      </td>
                      {/* Missing Hrs */}
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {missingHours > 0 ? (
                          <Link
                            href={`/dashboard/admin/employees/${e.id}/missing-hours?periodStart=${periodStart}&periodEnd=${periodEnd}`}
                            style={{ color: 'var(--red)', fontWeight: 600, textDecoration: 'none' }}
                          >
                            {missingHours.toFixed(1)}
                          </Link>
                        ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      {/* PTO Balance */}
                      <td>
                        <span style={{
                          fontVariantNumeric: 'tabular-nums',
                          fontWeight: 600,
                          color: pto < 2 ? 'var(--red)' : pto < 5 ? 'var(--amber)' : 'var(--green)',
                        }}>
                          {pto}d
                        </span>
                      </td>
                      {/* Base Pay */}
                      <td style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12.5, borderLeft: '1px solid var(--border)' }}>
                        {basePay != null
                          ? `$${basePay.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      {/* Deductions */}
                      <td style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12.5 }}>
                        {deduction != null && deduction > 0
                          ? <span style={{ color: 'var(--red)' }}>−${deduction.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      {/* OT Pay */}
                      <td style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12.5 }}>
                        {otPay != null && otPay > 0
                          ? <span style={{ color: 'var(--accent)' }}>+${otPay.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      {/* Incentives */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{
                            fontVariantNumeric: 'tabular-nums',
                            fontSize: 12.5,
                            color: incentivesTotal > 0 ? 'var(--text-primary)' : 'var(--text-muted)',
                          }}>
                            {incentivesTotal > 0 ? `$${incentivesTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                          </span>
                          <button
                            onClick={() => setIncentiveEmployee(e)}
                            style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, padding: 0, whiteSpace: 'nowrap' }}
                          >
                            Edit
                          </button>
                        </div>
                      </td>
                      {/* Net Pay */}
                      <td style={{
                        fontVariantNumeric: 'tabular-nums',
                        fontWeight: 600,
                        color: netPay == null || !hasSalary
                          ? 'var(--text-muted)'
                          : missingHours > 0
                            ? 'var(--amber)'
                            : 'var(--green)',
                      }}>
                        {netPay != null
                          ? `$${netPay.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : '—'}
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
