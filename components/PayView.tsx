'use client'

import { useState } from 'react'

type Payslip = {
  id: string
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
}

const fmt$ = (n: number | null) =>
  n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function PayView({ payslips }: { payslips: Payslip[] }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const filtered = payslips.filter(p => {
    if (from && p.pay_date < from) return false
    if (to && p.pay_date > to) return false
    return true
  })

  const inputStyle: React.CSSProperties = {
    padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6,
    fontSize: 13, background: 'var(--surface)', color: 'var(--text-primary)', outline: 'none',
  }

  return (
    <div>
      {/* Date range filter */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} style={inputStyle} />
        </div>
        {(from || to) && (
          <button
            onClick={() => { setFrom(''); setTo('') }}
            style={{ padding: '7px 12px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', fontSize: 12.5, cursor: 'pointer', color: 'var(--text-muted)' }}
          >
            Clear
          </button>
        )}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            No payslips found.
            {(from || to) && (
              <div style={{ marginTop: 6, fontSize: 12 }}>Try adjusting the date range.</div>
            )}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                  {['Date', 'Pay Period', 'Gross', 'Deductions', 'Net Amount', ''].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 16px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr
                    key={p.id}
                    style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    onClick={() => window.open(`/payslips/${p.id}/print`, '_blank')}
                  >
                    <td style={{ padding: '12px 16px', fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)', fontWeight: 500 }}>
                      {new Date(p.pay_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td style={{ padding: '12px 16px', fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)', fontSize: 12 }}>
                      {p.pay_period_start} → {p.pay_period_end}
                    </td>
                    <td style={{ padding: '12px 16px', fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
                      {fmt$(p.gross_pay)}
                    </td>
                    <td style={{ padding: '12px 16px', fontVariantNumeric: 'tabular-nums', color: p.deductions > 0 ? 'var(--red)' : 'var(--text-muted)' }}>
                      {fmt$(p.deductions)}
                    </td>
                    <td style={{ padding: '12px 16px', fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 14, color: 'var(--green)' }}>
                      {fmt$(p.net_pay)}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 500 }}>PDF ↗</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
