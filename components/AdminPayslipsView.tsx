'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { PAY_SCHEDULES, PAY_SCHEDULE_LABELS, getPayScheduleBounds, type PaySchedule } from '@/lib/payslips'

type Employee = { id: string; name: string; work_email: string }

type PayslipRow = {
  id: string
  employee_id: string
  pay_date: string
  pay_period_start: string
  pay_period_end: string
  pay_schedule: string
  hours_worked: number
  rate: number | null
  gross_pay: number | null
  deductions: number
  net_pay: number | null
  pto_balance: number | null
  status: string
  applied_at: string | null
  notes: string | null
  employees: { name: string; work_email: string } | null
}

const fmt$ = (n: number | null) =>
  n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const today = new Date()
const DEFAULT_YEAR = today.getFullYear()
const DEFAULT_MONTH = today.getMonth() + 1

export function AdminPayslipsView({
  employees,
  initialPayslips,
}: {
  employees: Employee[]
  initialPayslips: PayslipRow[]
}) {
  const router = useRouter()
  const [payslips, setPayslips] = useState<PayslipRow[]>(initialPayslips)
  const [filterEmployee, setFilterEmployee] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState<PayslipRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [applying, setApplying] = useState<string | null>(null)
  const [error, setError] = useState('')

  // Create form state
  const [form, setForm] = useState({
    employee_id: '',
    schedule: '30th' as PaySchedule,
    refYear: DEFAULT_YEAR,
    refMonth: DEFAULT_MONTH,
    hours_worked: '',
    rate: '',
    deductions: '',
    pto_balance: '',
    pto_unit: 'days',
    notes: '',
  })
  const [fetchingHours, setFetchingHours] = useState(false)
  const [periodInfo, setPeriodInfo] = useState<{ periodStart: string; periodEnd: string; payDate: string } | null>(null)

  // Recompute period preview whenever schedule/month/year changes
  const computedPeriod = form.employee_id
    ? getPayScheduleBounds(form.schedule, form.refYear, form.refMonth)
    : null

  const fetchHours = useCallback(async () => {
    if (!form.employee_id) return
    const bounds = getPayScheduleBounds(form.schedule, form.refYear, form.refMonth)
    setFetchingHours(true)
    try {
      const res = await fetch(
        `/api/admin/payslips/hours?employee_id=${form.employee_id}&from=${bounds.periodStart}&to=${bounds.periodEnd}`
      )
      const json = await res.json()
      if (res.ok) {
        setForm(f => ({
          ...f,
          hours_worked: String(json.hours_worked ?? ''),
          pto_balance: json.pto_balance != null ? String(json.pto_balance) : '',
          pto_unit: json.pto_unit ?? 'days',
        }))
        setPeriodInfo(bounds)
      }
    } finally {
      setFetchingHours(false)
    }
  }, [form.employee_id, form.schedule, form.refYear, form.refMonth])

  const gross =
    form.hours_worked && form.rate
      ? Math.round(parseFloat(form.hours_worked) * parseFloat(form.rate) * 100) / 100
      : null
  const net =
    gross != null
      ? Math.max(0, Math.round((gross - (parseFloat(form.deductions) || 0)) * 100) / 100)
      : null

  async function handleSave(status: 'draft' | 'applied') {
    setError('')
    if (!form.employee_id) { setError('Select an employee.'); return }
    const bounds = computedPeriod ?? getPayScheduleBounds(form.schedule, form.refYear, form.refMonth)
    setSaving(true)
    try {
      const res = await fetch('/api/admin/payslips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: form.employee_id,
          pay_schedule: form.schedule,
          pay_date: bounds.payDate,
          pay_period_start: bounds.periodStart,
          pay_period_end: bounds.periodEnd,
          hours_worked: form.hours_worked,
          rate: form.rate,
          deductions: form.deductions || '0',
          pto_balance: form.pto_balance || null,
          notes: form.notes,
          status,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Error saving.'); return }

      const emp = employees.find(e => e.id === form.employee_id)
      setPayslips(prev => [{ ...json, employees: emp ? { name: emp.name, work_email: emp.work_email } : null }, ...prev])
      setShowCreate(false)
      resetForm()
      router.refresh()
    } catch {
      setError('Network error.')
    } finally {
      setSaving(false)
    }
  }

  async function handleApply(id: string) {
    setApplying(id)
    try {
      const res = await fetch('/api/admin/payslips', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'applied' }),
      })
      const json = await res.json()
      if (res.ok) {
        setPayslips(prev => prev.map(p => p.id === id ? { ...p, ...json } : p))
        router.refresh()
      }
    } finally {
      setApplying(null)
    }
  }

  async function handleEditSave() {
    if (!editTarget) return
    setError('')
    setSaving(true)
    try {
      const res = await fetch('/api/admin/payslips', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editTarget.id,
          hours_worked: editTarget.hours_worked,
          rate: editTarget.rate,
          deductions: editTarget.deductions,
          pto_balance: editTarget.pto_balance,
          notes: editTarget.notes,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Error saving.'); return }
      setPayslips(prev => prev.map(p => p.id === editTarget.id ? { ...p, ...json } : p))
      setEditTarget(null)
      router.refresh()
    } catch {
      setError('Network error.')
    } finally {
      setSaving(false)
    }
  }

  function resetForm() {
    setForm({ employee_id: '', schedule: '30th', refYear: DEFAULT_YEAR, refMonth: DEFAULT_MONTH, hours_worked: '', rate: '', deductions: '', pto_balance: '', pto_unit: 'days', notes: '' })
    setPeriodInfo(null)
    setError('')
  }

  const filtered = payslips.filter(p => {
    if (filterEmployee && p.employee_id !== filterEmployee) return false
    if (filterStatus !== 'all' && p.status !== filterStatus) return false
    return true
  })

  const months = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: new Date(2000, i).toLocaleString('en-US', { month: 'long' }),
  }))
  const years = Array.from({ length: 3 }, (_, i) => DEFAULT_YEAR - 1 + i)

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px', border: '1px solid var(--border)',
    borderRadius: 6, fontSize: 13, background: 'var(--surface)', color: 'var(--text-primary)',
    outline: 'none',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4,
  }

  return (
    <div>
      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          value={filterEmployee}
          onChange={e => setFilterEmployee(e.target.value)}
          style={{ ...inputStyle, width: 'auto', minWidth: 180 }}
        >
          <option value="">All Employees</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          style={{ ...inputStyle, width: 'auto', minWidth: 120 }}
        >
          <option value="all">All Status</option>
          <option value="draft">Draft</option>
          <option value="applied">Applied</option>
        </select>
        <div style={{ flex: 1 }} />
        <button
          className="btn btn-primary"
          onClick={() => { setShowCreate(true); resetForm() }}
        >
          + Create Payslip
        </button>
      </div>

      {/* Payslips table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            No payslips found.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                  {['Employee', 'Pay Date', 'Period', 'Schedule', 'Hours', 'Rate', 'Gross', 'Deductions', 'Net', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '9px 12px', fontWeight: 500, color: 'var(--text-primary)' }}>
                      {p.employees?.name ?? '—'}
                    </td>
                    <td style={{ padding: '9px 12px', fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>{p.pay_date}</td>
                    <td style={{ padding: '9px 12px', fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {p.pay_period_start} → {p.pay_period_end}
                    </td>
                    <td style={{ padding: '9px 12px', color: 'var(--text-muted)' }}>{p.pay_schedule}</td>
                    <td style={{ padding: '9px 12px', fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>
                      {p.hours_worked}h
                    </td>
                    <td style={{ padding: '9px 12px', fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>
                      {p.rate != null ? `$${p.rate}/hr` : '—'}
                    </td>
                    <td style={{ padding: '9px 12px', fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)', fontWeight: 500 }}>
                      {fmt$(p.gross_pay)}
                    </td>
                    <td style={{ padding: '9px 12px', fontVariantNumeric: 'tabular-nums', color: p.deductions > 0 ? 'var(--red)' : 'var(--text-muted)' }}>
                      {fmt$(p.deductions)}
                    </td>
                    <td style={{ padding: '9px 12px', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: 'var(--green)' }}>
                      {fmt$(p.net_pay)}
                    </td>
                    <td style={{ padding: '9px 12px' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                        background: p.status === 'applied' ? 'var(--green-soft)' : 'var(--amber-soft)',
                        color: p.status === 'applied' ? 'var(--green)' : 'var(--amber)',
                      }}>
                        {p.status === 'applied' ? 'Applied' : 'Draft'}
                      </span>
                    </td>
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <a
                          href={`/payslips/${p.id}/print`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 500, textDecoration: 'none' }}
                        >
                          View
                        </a>
                        <span style={{ color: 'var(--border)' }}>|</span>
                        <button
                          onClick={() => setEditTarget(p)}
                          style={{ background: 'none', border: 'none', fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 500, padding: 0 }}
                        >
                          Edit
                        </button>
                        {p.status === 'draft' && (
                          <>
                            <span style={{ color: 'var(--border)' }}>|</span>
                            <button
                              onClick={() => handleApply(p.id)}
                              disabled={applying === p.id}
                              style={{ background: 'none', border: 'none', fontSize: 11, color: 'var(--green)', cursor: 'pointer', fontWeight: 500, padding: 0 }}
                            >
                              {applying === p.id ? '…' : 'Apply'}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Create Payslip Modal ── */}
      {showCreate && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div style={{
            background: 'var(--surface)', borderRadius: 12, padding: 28,
            width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Create Payslip</div>
              <button onClick={() => { setShowCreate(false); resetForm() }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)', lineHeight: 1 }}>×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Employee */}
              <div>
                <label style={labelStyle}>Employee</label>
                <select value={form.employee_id} onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))} style={inputStyle}>
                  <option value="">Select employee…</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>

              {/* Schedule */}
              <div>
                <label style={labelStyle}>Pay Schedule</label>
                <select value={form.schedule} onChange={e => setForm(f => ({ ...f, schedule: e.target.value as PaySchedule }))} style={inputStyle}>
                  {PAY_SCHEDULES.map(s => <option key={s} value={s}>{PAY_SCHEDULE_LABELS[s]}</option>)}
                </select>
              </div>

              {/* Reference month/year */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Pay Month</label>
                  <select value={form.refMonth} onChange={e => setForm(f => ({ ...f, refMonth: parseInt(e.target.value) }))} style={inputStyle}>
                    {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Pay Year</label>
                  <select value={form.refYear} onChange={e => setForm(f => ({ ...f, refYear: parseInt(e.target.value) }))} style={inputStyle}>
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>

              {/* Period preview */}
              {form.employee_id && computedPeriod && (
                <div style={{ background: 'var(--bg)', borderRadius: 6, padding: '10px 12px', fontSize: 12.5, color: 'var(--text-secondary)', display: 'flex', gap: 20 }}>
                  <span><strong>Period:</strong> {computedPeriod.periodStart} → {computedPeriod.periodEnd}</span>
                  <span><strong>Pay Date:</strong> {computedPeriod.payDate}</span>
                </div>
              )}

              {/* Fetch hours */}
              {form.employee_id && (
                <button
                  type="button"
                  onClick={fetchHours}
                  disabled={fetchingHours}
                  style={{ alignSelf: 'flex-start', padding: '6px 14px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', fontSize: 12.5, fontWeight: 500, cursor: fetchingHours ? 'wait' : 'pointer', color: 'var(--text-secondary)' }}
                >
                  {fetchingHours ? 'Fetching…' : '↻ Fetch Hours from Time Entries'}
                </button>
              )}

              {/* Hours, Rate, Deductions */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Hours Worked</label>
                  <input type="number" step="0.01" min="0" value={form.hours_worked} onChange={e => setForm(f => ({ ...f, hours_worked: e.target.value }))} placeholder="0.00" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Rate ($/hr)</label>
                  <input type="number" step="0.01" min="0" value={form.rate} onChange={e => setForm(f => ({ ...f, rate: e.target.value }))} placeholder="0.00" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Deductions ($)</label>
                  <input type="number" step="0.01" min="0" value={form.deductions} onChange={e => setForm(f => ({ ...f, deductions: e.target.value }))} placeholder="0.00" style={inputStyle} />
                </div>
              </div>

              {/* Computed preview */}
              {gross != null && (
                <div style={{ background: 'var(--bg)', borderRadius: 6, padding: '10px 12px', fontSize: 12.5, display: 'flex', gap: 24 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Gross: <strong style={{ color: 'var(--text-primary)' }}>{fmt$(gross)}</strong></span>
                  <span style={{ color: 'var(--text-secondary)' }}>Deductions: <strong style={{ color: 'var(--red)' }}>{fmt$(parseFloat(form.deductions) || 0)}</strong></span>
                  <span style={{ color: 'var(--text-secondary)' }}>Net: <strong style={{ color: 'var(--green)' }}>{fmt$(net)}</strong></span>
                </div>
              )}

              {/* PTO Balance */}
              <div>
                <label style={labelStyle}>PTO Balance Snapshot</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="number" step="0.01" min="0" value={form.pto_balance} onChange={e => setForm(f => ({ ...f, pto_balance: e.target.value }))} placeholder="Auto-filled on Fetch Hours" style={{ ...inputStyle, flex: 1 }} />
                  <span style={{ padding: '7px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12.5, color: 'var(--text-muted)' }}>{form.pto_unit}</span>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label style={labelStyle}>Notes (optional)</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Any notes…" style={{ ...inputStyle, resize: 'vertical' }} />
              </div>

              {error && <div style={{ fontSize: 12.5, color: 'var(--red)' }}>{error}</div>}

              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button
                  onClick={() => handleSave('draft')}
                  disabled={saving}
                  style={{ flex: 1, padding: '9px 0', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', fontSize: 13, fontWeight: 600, cursor: saving ? 'wait' : 'pointer', color: 'var(--text-secondary)' }}
                >
                  {saving ? 'Saving…' : 'Save Draft'}
                </button>
                <button
                  onClick={() => handleSave('applied')}
                  disabled={saving}
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                >
                  {saving ? 'Saving…' : 'Save and Apply'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Payslip Modal ── */}
      {editTarget && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 28, width: '100%', maxWidth: 480 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Edit Payslip</div>
              <button onClick={() => { setEditTarget(null); setError('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)', lineHeight: 1 }}>×</button>
            </div>

            <div style={{ marginBottom: 14, padding: '10px 12px', background: 'var(--bg)', borderRadius: 6, fontSize: 12.5, color: 'var(--text-secondary)' }}>
              <strong>{editTarget.employees?.name}</strong> · {editTarget.pay_period_start} → {editTarget.pay_period_end} · Pay date {editTarget.pay_date}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Hours</label>
                  <input type="number" step="0.01" min="0" value={editTarget.hours_worked ?? ''} onChange={e => setEditTarget(t => t ? { ...t, hours_worked: parseFloat(e.target.value) || 0 } : t)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Rate ($/hr)</label>
                  <input type="number" step="0.01" min="0" value={editTarget.rate ?? ''} onChange={e => setEditTarget(t => t ? { ...t, rate: parseFloat(e.target.value) || null } : t)} placeholder="0.00" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Deductions ($)</label>
                  <input type="number" step="0.01" min="0" value={editTarget.deductions ?? ''} onChange={e => setEditTarget(t => t ? { ...t, deductions: parseFloat(e.target.value) || 0 } : t)} style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>PTO Balance</label>
                <input type="number" step="0.01" value={editTarget.pto_balance ?? ''} onChange={e => setEditTarget(t => t ? { ...t, pto_balance: parseFloat(e.target.value) || null } : t)} placeholder="—" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Notes</label>
                <textarea value={editTarget.notes ?? ''} onChange={e => setEditTarget(t => t ? { ...t, notes: e.target.value } : t)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
              {error && <div style={{ fontSize: 12.5, color: 'var(--red)' }}>{error}</div>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => { setEditTarget(null); setError('') }} style={{ flex: 1, padding: '9px 0', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-secondary)' }}>
                  Cancel
                </button>
                <button onClick={handleEditSave} disabled={saving} className="btn btn-primary" style={{ flex: 1 }}>
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
