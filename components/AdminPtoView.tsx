'use client'

import { useState } from 'react'
import type { AccrualEvent } from '@/lib/pto'

type PtoRow = {
  id: string
  name: string
  employmentStartDate: string | null
  balanceDays: number
  history: AccrualEvent[]
}

type AdjustState = {
  employeeId: string
  employeeName: string
  currentBalance: number
} | null

export function AdminPtoView({ rows, today }: { rows: PtoRow[]; today: string }) {
  const [balances, setBalances] = useState<Record<string, number>>(
    Object.fromEntries(rows.map(r => [r.id, r.balanceDays]))
  )
  const [adjusting, setAdjusting] = useState<AdjustState>(null)
  const [historyFor, setHistoryFor] = useState<string | null>(null)
  const [delta, setDelta] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function openAdjust(row: PtoRow) {
    setAdjusting({ employeeId: row.id, employeeName: row.name, currentBalance: balances[row.id] ?? row.balanceDays })
    setDelta('')
    setReason('')
    setError('')
  }

  function closeAdjust() {
    setAdjusting(null)
    setError('')
  }

  async function submitAdjust() {
    if (!adjusting) return
    const d = parseFloat(delta)
    if (isNaN(d) || d === 0) { setError('Enter a non-zero amount.'); return }
    if (!reason.trim()) { setError('Reason is required.'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/pto', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: adjusting.employeeId, delta: d, reason }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed to save.'); return }
      setBalances(prev => ({ ...prev, [adjusting.employeeId]: json.current_balance }))
      closeAdjust()
    } catch {
      setError('Network error.')
    } finally {
      setSaving(false)
    }
  }

  const historyRow = rows.find(r => r.id === historyFor)

  return (
    <>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Employee', 'Start Date', 'Balance (Days)', 'Balance (Hours)', 'Actions'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
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
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button
                        onClick={() => openAdjust(row)}
                        style={{ fontSize: 12, fontWeight: 500, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                      >
                        Adjust
                      </button>
                      <button
                        onClick={() => setHistoryFor(historyFor === row.id ? null : row.id)}
                        style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                      >
                        History
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* History inline panel */}
      {historyFor && historyRow && (
        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div className="card-title" style={{ margin: 0 }}>PTO History — {historyRow.name}</div>
            <button onClick={() => setHistoryFor(null)} style={{ fontSize: 12, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>Close</button>
          </div>
          {historyRow.history.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No history yet.</p>
          ) : (
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
                      <span style={{
                        fontSize: 11, fontWeight: 600, borderRadius: 4, padding: '2px 7px',
                        background: e.type === 'manual_adjustment' ? 'var(--accent-muted, rgba(99,102,241,0.12))' : e.type === 'annual_reset' ? 'rgba(34,197,94,0.12)' : 'rgba(251,191,36,0.15)',
                        color: e.type === 'manual_adjustment' ? 'var(--accent)' : e.type === 'annual_reset' ? 'var(--green)' : 'var(--amber)',
                      }}>
                        {e.type.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: e.days >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {e.days > 0 ? '+' : ''}{e.days}
                    </td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{e.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Adjust modal */}
      {adjusting && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ width: 380, padding: '24px 28px' }}>
            <div className="card-title" style={{ marginBottom: 4 }}>Adjust PTO — {adjusting.employeeName}</div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>
              Current balance: <strong style={{ color: 'var(--text-primary)' }}>{adjusting.currentBalance} days</strong>
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>
                  Adjustment (use negative to deduct)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={delta}
                  onChange={e => setDelta(e.target.value)}
                  placeholder="e.g. 2 or -1"
                  className="form-input"
                  style={{ width: '100%' }}
                  autoFocus
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>
                  Reason <span style={{ color: 'var(--red)' }}>*</span>
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="e.g. Correction for approved leave"
                  className="form-input"
                  style={{ width: '100%' }}
                  onKeyDown={e => e.key === 'Enter' && submitAdjust()}
                />
              </div>
              {error && <p style={{ fontSize: 12, color: 'var(--red)', margin: 0 }}>{error}</p>}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={closeAdjust} className="btn btn-secondary" style={{ fontSize: 13 }}>Cancel</button>
              <button onClick={submitAdjust} disabled={saving} className="btn btn-primary" style={{ fontSize: 13 }}>
                {saving ? 'Saving…' : 'Save Adjustment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
