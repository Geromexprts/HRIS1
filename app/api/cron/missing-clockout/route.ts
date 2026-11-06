import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { laToday } from '@/lib/dates'
import { verifyCronSecret } from '@/lib/cron'
import { sendMissingClockoutEmail } from '@/lib/email'

function prevWorkday(today: string): string {
  const [y, m, d] = today.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  do {
    dt.setDate(dt.getDate() - 1)
  } while (dt.getDay() === 0 || dt.getDay() === 6)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

export async function POST(req: NextRequest) {
  const authError = verifyCronSecret(req)
  if (authError) return authError

  const today = laToday()

  // Skip weekends
  const [y, m, d] = today.split('-').map(Number)
  const dow = new Date(y, m - 1, d).getDay()
  if (dow === 0 || dow === 6) return NextResponse.json({ skipped: 'weekend', date: today })

  const checkDate = prevWorkday(today)

  // Find open entries from the previous workday
  const { data: openEntries } = await supabaseAdmin
    .from('time_entries')
    .select('employee_id, clock_in')
    .eq('date', checkDate)
    .is('clock_out', null)

  if (!openEntries?.length) return NextResponse.json({ notified: 0, date: checkDate })

  // Fetch employee details for those IDs
  const empIds = openEntries.map((e: { employee_id: string }) => e.employee_id)
  const { data: employees } = await supabaseAdmin
    .from('employees')
    .select('id, name, work_email')
    .in('id', empIds)

  const empById = Object.fromEntries((employees ?? []).map(e => [e.id, e]))

  const dryRun = new URL(req.url).searchParams.get('dry_run') === 'true'
  const twentyHoursAgo = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString()
  const geromeEmail = process.env.GEROME_EMAIL ?? 'geromemontealegre@xprts.com'
  let notified = 0

  for (const entry of openEntries) {
    const emp = empById[entry.employee_id]

    // Idempotency: already sent today?
    const { data: existing } = await supabaseAdmin
      .from('notifications')
      .select('id')
      .eq('employee_id', entry.employee_id)
      .eq('title', 'Missing Clock-out')
      .gte('created_at', twentyHoursAgo)
      .maybeSingle()

    if (existing) continue

    if (!dryRun) {
      await supabaseAdmin.from('notifications').insert({
        employee_id: entry.employee_id,
        title: 'Missing Clock-out',
        body: `Your time entry for ${checkDate} was never clocked out. Please edit it in My Time.`,
        link: '/dashboard/time',
      })

      if (emp?.work_email) {
        await sendMissingClockoutEmail({
          toEmail: emp.work_email,
          toName: emp.name ?? 'there',
          date: checkDate,
          ccEmail: geromeEmail,
        })
      }
    }

    notified++
  }

  return NextResponse.json({ notified, date: checkDate, dry_run: dryRun })
}
