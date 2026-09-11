import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

const FROM = process.env.EMAIL_FROM ?? 'HRIS Portal <noreply@xprts.com>'
const PORTAL_URL = process.env.NEXTAUTH_URL ?? 'https://hris.xprts.com'

export async function sendLeaveDecisionEmail({
  toEmail,
  toName,
  status,
  daysRequested,
  startDate,
  endDate,
  note,
}: {
  toEmail: string
  toName: string
  status: 'approved' | 'denied'
  daysRequested: number
  startDate: string
  endDate: string
  note?: string | null
}) {
  const isApproved = status === 'approved'
  const subject = isApproved
    ? `Leave Approved — ${daysRequested} day${daysRequested !== 1 ? 's' : ''}`
    : `Leave Request Update`

  const dateRange = startDate === endDate ? startDate : `${startDate} – ${endDate}`

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; color: #1a1f2e;">
      <div style="background: #1A2035; padding: 24px 32px; border-radius: 10px 10px 0 0;">
        <p style="color: #8B97B4; font-size: 12px; margin: 0 0 4px; text-transform: uppercase; letter-spacing: 0.08em;">HRIS Portal · xprts.com</p>
        <h1 style="color: #ffffff; font-size: 20px; margin: 0; font-weight: 600;">Leave ${isApproved ? 'Approved' : 'Denied'}</h1>
      </div>
      <div style="background: #ffffff; padding: 28px 32px; border: 1px solid #e5e9f2; border-top: none; border-radius: 0 0 10px 10px;">
        <p style="margin: 0 0 20px; font-size: 14px; color: #4a5168;">Hi ${toName},</p>
        <p style="margin: 0 0 20px; font-size: 14px; color: #4a5168;">
          Your leave request has been <strong style="color: ${isApproved ? '#22c55e' : '#ef4444'}">${status}</strong>.
        </p>
        <div style="background: #f7f8fc; border-radius: 8px; padding: 16px 20px; margin-bottom: 20px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr>
              <td style="padding: 4px 0; color: #8B97B4;">Dates</td>
              <td style="padding: 4px 0; font-weight: 600; color: #1a1f2e;">${dateRange}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #8B97B4;">Days</td>
              <td style="padding: 4px 0; font-weight: 600; color: #1a1f2e;">${daysRequested}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #8B97B4;">Status</td>
              <td style="padding: 4px 0; font-weight: 600; color: ${isApproved ? '#22c55e' : '#ef4444'}; text-transform: capitalize;">${status}</td>
            </tr>
            ${note ? `<tr><td style="padding: 4px 0; color: #8B97B4; vertical-align: top;">Note</td><td style="padding: 4px 0; color: #1a1f2e;">${note}</td></tr>` : ''}
          </table>
        </div>
        <p style="margin: 0; font-size: 13px; color: #8B97B4;">Log in to the portal to view your leave history and PTO balance.</p>
      </div>
    </div>
  `

  try {
    await resend.emails.send({ from: FROM, to: toEmail, subject, html })
  } catch (err) {
    console.error('[email] failed to send leave decision email:', err)
  }
}

export async function sendLeaveSubmittedEmail({
  toEmail,
  toName,
  employeeName,
  leaveType,
  daysRequested,
  startDate,
  endDate,
  reason,
}: {
  toEmail: string
  toName: string
  employeeName: string
  leaveType: string
  daysRequested: number
  startDate: string
  endDate: string
  reason?: string | null
}) {
  const dateRange = startDate === endDate ? startDate : `${startDate} – ${endDate}`
  const subject = `Leave Request — ${employeeName} (${daysRequested} day${daysRequested !== 1 ? 's' : ''})`

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; color: #1a1f2e;">
      <div style="background: #1A2035; padding: 24px 32px; border-radius: 10px 10px 0 0;">
        <p style="color: #8B97B4; font-size: 12px; margin: 0 0 4px; text-transform: uppercase; letter-spacing: 0.08em;">HRIS Portal · xprts.com</p>
        <h1 style="color: #ffffff; font-size: 20px; margin: 0; font-weight: 600;">New Leave Request</h1>
      </div>
      <div style="background: #ffffff; padding: 28px 32px; border: 1px solid #e5e9f2; border-top: none; border-radius: 0 0 10px 10px;">
        <p style="margin: 0 0 20px; font-size: 14px; color: #4a5168;">Hi ${toName},</p>
        <p style="margin: 0 0 20px; font-size: 14px; color: #4a5168;">
          <strong>${employeeName}</strong> has submitted a leave request that requires your review.
        </p>
        <div style="background: #f7f8fc; border-radius: 8px; padding: 16px 20px; margin-bottom: 20px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr>
              <td style="padding: 4px 0; color: #8B97B4;">Employee</td>
              <td style="padding: 4px 0; font-weight: 600; color: #1a1f2e;">${employeeName}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #8B97B4;">Type</td>
              <td style="padding: 4px 0; font-weight: 600; color: #1a1f2e; text-transform: capitalize;">${leaveType}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #8B97B4;">Dates</td>
              <td style="padding: 4px 0; font-weight: 600; color: #1a1f2e;">${dateRange}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #8B97B4;">Days</td>
              <td style="padding: 4px 0; font-weight: 600; color: #1a1f2e;">${daysRequested}</td>
            </tr>
            ${reason ? `<tr><td style="padding: 4px 0; color: #8B97B4; vertical-align: top;">Reason</td><td style="padding: 4px 0; color: #1a1f2e;">${reason}</td></tr>` : ''}
          </table>
        </div>
        <a href="${PORTAL_URL}/dashboard/approvals" style="display: inline-block; background: #4f6ef7; color: #ffffff; padding: 10px 20px; border-radius: 6px; font-size: 13px; font-weight: 600; text-decoration: none;">Review in Portal</a>
      </div>
    </div>
  `

  try {
    await resend.emails.send({ from: FROM, to: toEmail, subject, html })
  } catch (err) {
    console.error('[email] failed to send leave submitted email:', err)
  }
}
