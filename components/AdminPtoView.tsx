'use client'

import { useState } from 'react'
import type { AccrualEvent } from '@/lib/pto'

const ACCRUAL_RATE = 0.03846

type XprtsRow = {
  id: string
  name: string
  employmentStartDate: string | null
  balanceDays: number
  history: AccrualEvent[]
}

type PlacedStaffRow = {
  id: string
  name: string
  clientName: string | null
  clientStartDate: string | null
  isFloating: boolean
  tenureMonths: number | null
  isEligible: boolean
  tenureHoursWorked: number
  earnedPtoHours: number
  manualAdjustmentHours: number
  currentBalanceHours: number
  adjustmentHistory: { date: string; delta_hours: number; reason: string }[]
  notes: string | null
}

// ── XPRTS Tab ────────────────────────────────────────────────────────────────

function XprtsPtoTab({ rows }: { rows: XprtsRow[] }) {
  const [balances, setBalances] = useState<Record<string, number>>(
    Object.fromEntries(rows.map(r => [r.id, r.balanceDays]))
  )
  const [adjusting, setAdjusting] = useState<{ id: string; name: string; balance: number } | null>(null)
  const [historyFor, setHistoryFor] = useState<string | null>(null)
  const [delta, setDelta] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [switching, setSwitching] = useState<string | null>(null)

  async function submitAdjust() {
    if (!adjusting) return
    const d = parseFloat(delta)
    if (isNaN(d) || d === 0) { setError('Enter a non-zero amount.'); return }
    if (!reason.trim()) { setError('Reason is required.'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/admin/pto', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: adjusting.id, delta: d, reason }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed to save.'); return }
      setBalances(prev => ({ ...prev, [adjusting.id]: json.current_balance }))
      setAdjusting(null); setDelta(''); setReason('')
    } catch { setError('Network error.') }
    finally { setSaving(false) }
  }

  async function switchToPlacedStaff(id: string) {
    if (!confirm('Move this employee to Placed Staff PTO? They will no longer accrue under the XPRTS policy.')) return
    setSwitching(id)
    await fetch('/api/admin/placed-staff-pto', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_id: id }),
    })
    setSwitching(null)
    window.location.reload()
  }

  const historyRow = rows.find(r => r.id === historyFor)

  return (
    <>
      <div style={{ marginBottom: 10, fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 16, alignItems: 'center' }}>
        <span>Policy: <strong style={{ color: 'var(--text-secondary)' }}>10 days/year · prorated first year · resets Jan 1 · no carryover</strong></span>
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Employee', 'Start Date', 'Balance (Days)', 'Balance (Hrs)', 'Actions'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No employees on XPRTS PTO policy.</td></tr>
            )}
            {rows.map((row, i) => {
              const days = balances[row.id] ?? row.balanceDays
              const hours = Math.round(days * 8 * 10) / 10
              const isLow = days < 1
              return (
                <tr key={row.id} style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 500, color: 'var(--text-primary)' }}>{row.name}</td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{row.employmentStartDate ?? '—'}</td>
                  <td style={{ padding: '12px 16px', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: isLow ? 'var(--red)' : 'var(--text-primary)' }}>
                    {days}
                    {isLow && <span style={{ marginLeft: 6, fontSize: 10, background: 'var(--red)', color: '#fff', borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>LOW</span>}
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{hours}h</td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <button onClick={() => { setAdjusting({ id: row.id, name: row.name, balance: days }); setDelta(''); setReason(''); setError('') }}
                        style={{ fontSize: 12, fontWeight: 500, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Adjust</button>
                      <button onClick={() => setHistoryFor(historyFor === row.id ? null : row.id)}
                        style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>History</button>
                      <button onClick={() => switchToPlacedStaff(row.id)} disabled={switching === row.id}
                        style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                        {switching === row.id ? '…' : '→ Placed Staff'}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {historyFor && historyRow && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div className="card-title" style={{ margin: 0 }}>PTO History — {historyRow.name}</div>
            <button onClick={() => setHistoryFor(null)} style={{ fontSize: 12, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>Close</button>
          </div>
          {historyRow.history.length === 0
            ? <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No history yet.</p>
            : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Date', 'Type', 'Days', 'Note'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '6px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...historyRow.history].reverse().map((e, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 12px', fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>{e.date}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, borderRadius: 4, padding: '2px 7px', background: e.type === 'manual_adjustment' ? 'rgba(99,102,241,0.12)' : e.type === 'annual_reset' ? 'rgba(34,197,94,0.12)' : 'rgba(251,191,36,0.15)', color: e.type === 'manual_adjustment' ? 'var(--accent)' : e.type === 'annual_reset' ? 'var(--green)' : 'var(--amber)' }}>
                          {e.type.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: e.days >= 0 ? 'var(--green)' : 'var(--red)' }}>{e.days > 0 ? '+' : ''}{e.days}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{e.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      )}

      {adjusting && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ width: 380, padding: '24px 28px' }}>
            <div className="card-title" style={{ marginBottom: 4 }}>Adjust PTO — {adjusting.name}</div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>Current balance: <strong style={{ color: 'var(--text-primary)' }}>{adjusting.balance} days</strong></p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="field-label">Adjustment (negative to deduct)</label>
                <input type="number" step="0.5" value={delta} onChange={e => setDelta(e.target.value)} placeholder="e.g. 2 or -1" className="field-input" autoFocus />
              </div>
              <div>
                <label className="field-label">Reason <span style={{ color: 'var(--red)' }}>*</span></label>
                <input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Correction for approved leave" className="field-input" onKeyDown={e => e.key === 'Enter' && submitAdjust()} />
              </div>
              {error && <p style={{ fontSize: 12, color: 'var(--red)', margin: 0 }}>{error}</p>}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setAdjusting(null)} className="btn btn-ghost" style={{ fontSize: 13 }}>Cancel</button>
              <button onClick={submitAdjust} disabled={saving} className="btn btn-primary" style={{ fontSize: 13 }}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Placed Staff Tab ──────────────────────────────────────────────────────────

type EditState = { id: string; name: string; clientName: string; clientStartDate: string; isFloating: boolean; notes: string }
type AdjustHrsState = { id: string; name: string; currentBalance: number }

function PlacedStaffPtoTab({ rows }: { rows: PlacedStaffRow[] }) {
  const [list, setList] = useState<PlacedStaffRow[]>(rows)
  const [editing, setEditing] = useState<EditState | null>(null)
  const [adjusting, setAdjusting] = useState<AdjustHrsState | null>(null)
  const [historyFor, setHistoryFor] = useState<string | null>(null)
  const [deltaHrs, setDeltaHrs] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [switching, setSwitching] = useState<string | null>(null)

  function openEdit(row: PlacedStaffRow) {
    setEditing({ id: row.id, name: row.name, clientName: row.clientName ?? '', clientStartDate: row.clientStartDate ?? '', isFloating: row.isFloating, notes: row.notes ?? '' })
    setError('')
  }

  async function saveEdit(resetClient = false) {
    if (!editing) return
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/admin/placed-staff-pto', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: editing.id,
          client_name: editing.clientName,
          client_start_date: editing.clientStartDate,
          is_floating: editing.isFloating,
          notes: editing.notes,
          reset_client: resetClient,
        }),
      })
      if (!res.ok) { const j = await res.json(); setError(j.error ?? 'Failed.'); return }
      window.location.reload()
    } catch { setError('Network error.') }
    finally { setSaving(false) }
  }

  async function submitAdjust() {
    if (!adjusting) return
    const d = parseFloat(deltaHrs)
    if (isNaN(d) || d === 0) { setError('Enter a non-zero amount.'); return }
    if (!reason.trim()) { setError('Reason is required.'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/admin/placed-staff-pto', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: adjusting.id, delta_hours: d, reason }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed.'); return }
      setList(prev => prev.map(r => r.id === adjusting.id ? { ...r, manualAdjustmentHours: json.manual_adjustment_hours, currentBalanceHours: r.earnedPtoHours + json.manual_adjustment_hours } : r))
      setAdjusting(null); setDeltaHrs(''); setReason('')
    } catch { setError('Network error.') }
    finally { setSaving(false) }
  }

  async function switchToXprts(id: string) {
    if (!confirm('Move this employee back to XPRTS PTO policy?')) return
    setSwitching(id)
    await fetch('/api/admin/placed-staff-pto', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_id: id, pto_policy: 'xprts' }),
    })
    setSwitching(null)
    window.location.reload()
  }

  const historyRow = list.find(r => r.id === historyFor)

  return (
    <>
      <div style={{ marginBottom: 10, fontSize: 12, color: 'var(--text-muted)' }}>
        Policy: <strong style={{ color: 'var(--text-secondary)' }}>0.03846 PTO hrs per tenure hr worked · eligible after 6 months with client · forfeited Dec 31</strong>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 860 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Employee', 'Client', 'Client Start', 'Tenure', 'Eligible', 'Earned PTO (hrs)', 'Adjustment', 'Balance (hrs)', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                    No placed staff yet. Move employees here using the <strong>→ Placed Staff</strong> button on the PTO tab.
                  </td>
                </tr>
              )}
              {list.map((row, i) => {
                const bal = row.currentBalanceHours
                const isLow = row.isEligible && bal < 1
                const tenureLabel = row.tenureMonths == null ? '—' : row.tenureMonths < 12 ? `${row.tenureMonths}m` : `${Math.floor(row.tenureMonths / 12)}y ${row.tenureMonths % 12}m`
                return (
                  <tr key={row.id} style={{ borderBottom: i < list.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <td style={{ padding: '12px 12px', fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{row.name}</td>
                    <td style={{ padding: '12px 12px', color: 'var(--text-muted)' }}>{row.clientName ?? <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>not set</span>}</td>
                    <td style={{ padding: '12px 12px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{row.clientStartDate ?? '—'}</td>
                    <td style={{ padding: '12px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{tenureLabel}</td>
                    <td style={{ padding: '12px 12px' }}>
                      {row.isFloating
                        ? <span className="badge badge-amber">Floating</span>
                        : row.isEligible
                          ? <span className="badge badge-green">Yes</span>
                          : <span className="badge badge-gray">Not yet</span>}
                    </td>
                    <td style={{ padding: '12px 12px', fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>
                      {row.isEligible ? `${row.earnedPtoHours.toFixed(2)}h` : <span style={{ fontStyle: 'italic' }}>—</span>}
                      {row.isEligible && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{row.tenureHoursWorked.toFixed(1)}h tenure</div>}
                    </td>
                    <td style={{ padding: '12px 12px', fontVariantNumeric: 'tabular-nums', color: row.manualAdjustmentHours >= 0 ? 'var(--text-muted)' : 'var(--red)' }}>
                      {row.manualAdjustmentHours > 0 ? '+' : ''}{row.manualAdjustmentHours.toFixed(2)}h
                    </td>
                    <td style={{ padding: '12px 12px', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: isLow ? 'var(--red)' : 'var(--text-primary)' }}>
                      {row.isEligible ? `${bal.toFixed(2)}h` : '—'}
                      {isLow && <span style={{ marginLeft: 6, fontSize: 10, background: 'var(--red)', color: '#fff', borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>LOW</span>}
                    </td>
                    <td style={{ padding: '12px 12px' }}>
                      {row.isFloating
                        ? <span style={{ fontSize: 11, color: 'var(--amber)', fontWeight: 600 }}>Floating</span>
                        : <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600 }}>Active</span>}
                    </td>
                    <td style={{ padding: '12px 12px' }}>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'nowrap' }}>
                        <button onClick={() => openEdit(row)} style={{ fontSize: 12, fontWeight: 500, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, whiteSpace: 'nowrap' }}>Edit</button>
                        <button onClick={() => { setAdjusting({ id: row.id, name: row.name, currentBalance: row.currentBalanceHours }); setDeltaHrs(''); setReason(''); setError('') }}
                          style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, whiteSpace: 'nowrap' }}>Adjust</button>
                        <button onClick={() => setHistoryFor(historyFor === row.id ? null : row.id)}
                          style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, whiteSpace: 'nowrap' }}>History</button>
                        <button onClick={() => switchToXprts(row.id)} disabled={switching === row.id}
                          style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, whiteSpace: 'nowrap' }}>
                          {switching === row.id ? '…' : '→ XPRTS'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* History */}
      {historyFor && historyRow && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div className="card-title" style={{ margin: 0 }}>PTO Adjustment History — {historyRow.name}</div>
            <button onClick={() => setHistoryFor(null)} style={{ fontSize: 12, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>Close</button>
          </div>
          {historyRow.adjustmentHistory.length === 0
            ? <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No manual adjustments yet.</p>
            : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Date', 'Hours', 'Reason'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '6px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...historyRow.adjustmentHistory].reverse().map((e, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 12px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{e.date}</td>
                      <td style={{ padding: '8px 12px', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: e.delta_hours >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {e.delta_hours > 0 ? '+' : ''}{e.delta_hours.toFixed(2)}h
                      </td>
                      <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{e.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ width: 440, padding: '24px 28px' }}>
            <div className="card-title" style={{ marginBottom: 16 }}>Edit Placed Staff Info — {editing.name}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="field-label">Client Name</label>
                <input type="text" value={editing.clientName} onChange={e => setEditing(prev => prev && ({ ...prev, clientName: e.target.value }))} placeholder="e.g. BayLegal" className="field-input" />
              </div>
              <div>
                <label className="field-label">Client Start Date</label>
                <input type="date" value={editing.clientStartDate} onChange={e => setEditing(prev => prev && ({ ...prev, clientStartDate: e.target.value }))} className="field-input" />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="checkbox" id="floating-toggle" checked={editing.isFloating} onChange={e => setEditing(prev => prev && ({ ...prev, isFloating: e.target.checked }))} />
                <label htmlFor="floating-toggle" style={{ fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  Floating status <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>(resets tenure eligibility)</span>
                </label>
              </div>
              <div>
                <label className="field-label">Notes (optional)</label>
                <textarea value={editing.notes} onChange={e => setEditing(prev => prev && ({ ...prev, notes: e.target.value }))} placeholder="HR notes..." rows={2} className="field-input" style={{ resize: 'vertical' }} />
              </div>
              {error && <p style={{ fontSize: 12, color: 'var(--red)', margin: 0 }}>{error}</p>}
            </div>
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 16, paddingTop: 12 }}>
              <button onClick={() => { if (confirm('Reset client? This will clear all manual adjustments and history. The new client start date will reset their tenure.')) saveEdit(true) }}
                style={{ fontSize: 12, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                Reset (new client assignment)
              </button>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
              <button onClick={() => { setEditing(null); setError('') }} className="btn btn-ghost" style={{ fontSize: 13 }}>Cancel</button>
              <button onClick={() => saveEdit(false)} disabled={saving} className="btn btn-primary" style={{ fontSize: 13 }}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Adjust modal */}
      {adjusting && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ width: 380, padding: '24px 28px' }}>
            <div className="card-title" style={{ marginBottom: 4 }}>Adjust PTO Hours — {adjusting.name}</div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>Current balance: <strong style={{ color: 'var(--text-primary)' }}>{adjusting.currentBalance.toFixed(2)}h</strong></p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="field-label">Hours adjustment (negative to deduct)</label>
                <input type="number" step="0.25" value={deltaHrs} onChange={e => setDeltaHrs(e.target.value)} placeholder="e.g. 4 or -8" className="field-input" autoFocus />
              </div>
              <div>
                <label className="field-label">Reason <span style={{ color: 'var(--red)' }}>*</span></label>
                <input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. PTO used — approved leave Jan 15" className="field-input" onKeyDown={e => e.key === 'Enter' && submitAdjust()} />
              </div>
              {error && <p style={{ fontSize: 12, color: 'var(--red)', margin: 0 }}>{error}</p>}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => { setAdjusting(null); setError('') }} className="btn btn-ghost" style={{ fontSize: 13 }}>Cancel</button>
              <button onClick={submitAdjust} disabled={saving} className="btn btn-primary" style={{ fontSize: 13 }}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Root component ────────────────────────────────────────────────────────────

export function AdminPtoView({ xprtsRows, placedStaffRows, today }: {
  xprtsRows: XprtsRow[]
  placedStaffRows: PlacedStaffRow[]
  today: string
}) {
  const [tab, setTab] = useState<'xprts' | 'placed'>('xprts')

  return (
    <div>
      <div className="tabs" style={{ marginBottom: 16 }}>
        <button onClick={() => setTab('xprts')} className={`tab-btn ${tab === 'xprts' ? 'active' : ''}`}>
          PTO <span style={{ fontSize: 11, color: tab === 'xprts' ? 'inherit' : 'var(--text-muted)', marginLeft: 4 }}>({xprtsRows.length})</span>
        </button>
        <button onClick={() => setTab('placed')} className={`tab-btn ${tab === 'placed' ? 'active' : ''}`}>
          PTO – XPRTS Placed Staff <span style={{ fontSize: 11, color: tab === 'placed' ? 'inherit' : 'var(--text-muted)', marginLeft: 4 }}>({placedStaffRows.length})</span>
        </button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>Today: {today}</div>
      {tab === 'xprts' && <XprtsPtoTab rows={xprtsRows} />}
      {tab === 'placed' && <PlacedStaffPtoTab rows={placedStaffRows} />}
    </div>
  )
}
