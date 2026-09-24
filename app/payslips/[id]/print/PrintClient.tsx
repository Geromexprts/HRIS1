'use client'

import { useEffect } from 'react'

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
  notes: string | null
}

type Employee = {
  id: string
  name: string
  work_email: string
  employment_start_date: string | null
  pto_policy: string | null
} | null

const fmt$ = (n: number | null | undefined) =>
  n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const fmtDate = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

export function PrintClient({
  payslip,
  employee,
  ptoUnit,
}: {
  payslip: Payslip
  employee: Employee
  ptoUnit: string
}) {
  useEffect(() => {
    document.title = `Payslip – ${employee?.name ?? ''} – ${payslip.pay_date}`
  }, [employee, payslip.pay_date])

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; color: #111827; font-size: 14px; line-height: 1.5; }
        .page { max-width: 760px; margin: 0 auto; padding: 40px 40px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; padding-bottom: 20px; border-bottom: 2px solid #3D6FE8; }
        .company { }
        .company-name { font-size: 20px; font-weight: 800; color: #3D6FE8; letter-spacing: -0.02em; }
        .company-sub { font-size: 11px; color: #9CA3AF; letter-spacing: 0.04em; margin-top: 2px; }
        .payslip-label { text-align: right; }
        .payslip-title { font-size: 22px; font-weight: 700; color: #111827; }
        .payslip-date { font-size: 12px; color: #6B7280; margin-top: 3px; }
        .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 28px; }
        .section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #9CA3AF; margin-bottom: 10px; }
        .info-row { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px; }
        .info-label { color: #6B7280; }
        .info-value { font-weight: 500; color: #111827; text-align: right; max-width: 60%; }
        .divider { border: none; border-top: 1px solid #E5E7EB; margin: 20px 0; }
        .pay-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        .pay-table th { text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #9CA3AF; padding: 0 0 8px; border-bottom: 1px solid #E5E7EB; }
        .pay-table th.right { text-align: right; }
        .pay-table td { padding: 9px 0; font-size: 13px; border-bottom: 1px solid #F3F4F6; font-variant-numeric: tabular-nums; }
        .pay-table td.right { text-align: right; }
        .pay-table td.label { color: #374151; }
        .pay-table td.amount { font-weight: 500; }
        .pay-table tr.total td { font-size: 14px; font-weight: 700; border-bottom: none; border-top: 2px solid #111827; padding-top: 10px; }
        .net-box { background: #EEF3FD; border-radius: 10px; padding: 20px 24px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .net-label { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: #3D6FE8; }
        .net-amount { font-size: 28px; font-weight: 800; color: #111827; font-variant-numeric: tabular-nums; }
        .pto-row { display: flex; justify-content: space-between; font-size: 13px; color: #6B7280; margin-bottom: 4px; }
        .notes-box { background: #F9FAFB; border-radius: 6px; padding: 12px 14px; font-size: 12.5px; color: #374151; margin-top: 16px; }
        .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #E5E7EB; font-size: 11px; color: #9CA3AF; display: flex; justify-content: space-between; }
        .no-print { }
        .print-btn { position: fixed; top: 20px; right: 20px; background: #3D6FE8; color: #fff; border: none; border-radius: 8px; padding: 10px 18px; font-size: 13px; font-weight: 600; cursor: pointer; z-index: 10; display: flex; align-items: center; gap: 6px; }
        .print-btn:hover { background: #2E5ED9; }
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
          .page { padding: 20px; max-width: 100%; }
          .net-box { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <button className="print-btn no-print" onClick={() => window.print()}>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a1 1 0 001 1h8a1 1 0 001-1v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a1 1 0 00-1-1H6a1 1 0 00-1 1zm2 0h6v3H7V4zm-1 9v-2h8v2H6zm-2-4a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" />
        </svg>
        Download PDF
      </button>

      <div className="page">
        {/* Header */}
        <div className="header">
          <div className="company">
            <div className="company-name">XPRTS</div>
            <div className="company-sub">xprts.com · Offshore Talent</div>
          </div>
          <div className="payslip-label">
            <div className="payslip-title">Pay Slip</div>
            <div className="payslip-date">Pay Date: {fmtDate(payslip.pay_date)}</div>
          </div>
        </div>

        {/* Employee + Period info */}
        <div className="two-col">
          <div>
            <div className="section-title">Employee</div>
            <div className="info-row"><span className="info-label">Name</span><span className="info-value">{employee?.name ?? '—'}</span></div>
            <div className="info-row"><span className="info-label">Email</span><span className="info-value" style={{ fontSize: 12 }}>{employee?.work_email ?? '—'}</span></div>
            {employee?.employment_start_date && (
              <div className="info-row"><span className="info-label">Start Date</span><span className="info-value">{fmtDate(employee.employment_start_date)}</span></div>
            )}
          </div>
          <div>
            <div className="section-title">Pay Period</div>
            <div className="info-row"><span className="info-label">Period</span><span className="info-value">{payslip.pay_period_start} → {payslip.pay_period_end}</span></div>
            <div className="info-row"><span className="info-label">Schedule</span><span className="info-value">{payslip.pay_schedule}</span></div>
            <div className="info-row"><span className="info-label">Pay Date</span><span className="info-value">{fmtDate(payslip.pay_date)}</span></div>
          </div>
        </div>

        <hr className="divider" />

        {/* Earnings table */}
        <div className="section-title" style={{ marginBottom: 8 }}>Earnings</div>
        <table className="pay-table">
          <thead>
            <tr>
              <th>Description</th>
              <th className="right">Hours</th>
              <th className="right">Rate</th>
              <th className="right">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="label">Regular Pay</td>
              <td className="right amount">{payslip.hours_worked}h</td>
              <td className="right">{payslip.rate != null ? `$${payslip.rate}/hr` : '—'}</td>
              <td className="right amount">{fmt$(payslip.gross_pay)}</td>
            </tr>
          </tbody>
        </table>

        {/* Deductions */}
        <div className="section-title" style={{ marginBottom: 8 }}>Deductions</div>
        <table className="pay-table">
          <thead>
            <tr>
              <th>Description</th>
              <th className="right">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="label">Total Deductions</td>
              <td className="right amount" style={{ color: payslip.deductions > 0 ? '#DC2626' : '#374151' }}>{fmt$(payslip.deductions)}</td>
            </tr>
          </tbody>
        </table>

        {/* Net Pay */}
        <div className="net-box">
          <div className="net-label">Net Pay</div>
          <div className="net-amount">{fmt$(payslip.net_pay)}</div>
        </div>

        {/* PTO Balance */}
        {payslip.pto_balance != null && (
          <div style={{ marginBottom: 16 }}>
            <div className="section-title" style={{ marginBottom: 8 }}>PTO Balance</div>
            <div className="pto-row">
              <span>Available balance as of pay date</span>
              <span style={{ fontWeight: 600, color: '#111827' }}>
                {payslip.pto_balance} {ptoUnit}
              </span>
            </div>
          </div>
        )}

        {/* Notes */}
        {payslip.notes && (
          <div className="notes-box">
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9CA3AF', marginBottom: 5 }}>Notes</div>
            {payslip.notes}
          </div>
        )}

        {/* Footer */}
        <div className="footer">
          <span>XPRTS · xprts.com</span>
          <span>Generated {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          <span>Payslip #{payslip.id.slice(0, 8).toUpperCase()}</span>
        </div>
      </div>
    </>
  )
}
