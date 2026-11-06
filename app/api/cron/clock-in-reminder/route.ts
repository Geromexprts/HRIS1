import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { laToday } from '@/lib/dates'
import { verifyCronSecret } from '@/lib/cron'
import { sendClockInReminderEmail } from '@/lib/email'

export async function POST(req: NextRequest) {
  const authError = verifyCronSecret(req)
  if (authError) return authError

  const today = laToday()

  // Skip weekends
  const [y, m, d] = today.split('-').map(Number)
  const dow = new Date(y, m - 1, d).getDay()
  if (dow === 0 || dow === 6) return NextResponse.json({ skipped: 'weekend', date: today })

  // All active employees
  const { data: employees } = await supabaseAdmin
    .from('employees')
    .select('id, name, work_email')
    .eq('status', 'active')

  if (!employees?.length) return NextResponse.json({ notified: 0, date: today })

  // Who already has a time entry today
  const { data: todayEntries } = await supabaseAdmin
    .from('time_entries')
    .select('employee_id')
    .eq('date', today)

  const clockedInIds = new Set((todayEntries ?? []).map((e: { employee_id: string }) => e.employee_id))

  // Who is on approved leave today
  const { data: todayLeaves } = await supabaseAdmin
    .from('leave_requests')
    .select('employee_id')
    .eq('status', 'approved')
    .lte('start_date', today)
    .gte('end_date', today)

  const onLeaveIds = new Set((todayLeaves ?? []).map((r: { employee_id: string }) => r.employee_id))

  const dryRun = new URL(req.url).searchParams.get('dry_run') === 'true'
  const twentyHoursAgo = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString()
  const geromeEmail = process.env.GEROME_EMAIL ?? 'geromemontealegre@xprts.com'
  let notified = 0

  for (const emp of employees) {
    if (clockedInIds.has(emp.id)) continue
    if (onLeaveIds.has(emp.id)) continue

    // Idempotency: already sent today?
    const { data: existing } = await supabaseAdmin
      .from('notifications')
      .select('id')
      .eq('employee_id', emp.id)
      .eq('title', 'Clock-in Reminder')
      .gte('created_at', twentyHoursAgo)
      .maybeSingle()

    if (existing) continue

    if (!dryRun) {
      await supabaseAdmin.from('notifications').insert({
        employee_id: emp.id,
        title: 'Clock-in Reminder',
        body: `You haven't clocked in yet today (${today}). Please clock in when you start work.`,
        link: '/dashboard/time',
      })

      if (emp.work_email) {
        await sendClockInReminderEmail({
          toEmail: emp.work_email,
          toName: emp.name ?? 'there',
          today,
          ccEmail: geromeEmail,
        })
      }
    }

    notified++
  }

  return NextResponse.json({ notified, date: today, dry_run: dryRun })
}
