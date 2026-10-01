import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { laToday } from '@/lib/dates'
import { TimeTracker } from '@/components/TimeTracker'

export default async function TimePage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')

  const today = laToday()

  const [{ data: todayEntry }, { data: recentEntries }, { data: empRow }] = await Promise.all([
    supabaseAdmin.from('time_entries').select('*').eq('employee_id', session.user.id).eq('date', today).single(),
    supabaseAdmin.from('time_entries').select('*').eq('employee_id', session.user.id).order('date', { ascending: false }),
    supabaseAdmin.from('employees').select('early_clock_in').eq('id', session.user.id).single(),
  ])

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">My Time</h1>
        <p className="page-subtitle">Clock in, take breaks, and view your recent hours. All times in PST.</p>
      </div>
      <TimeTracker
        employeeId={session.user.id}
        todayEntry={todayEntry ?? null}
        recentEntries={recentEntries ?? []}
        earlyClockIn={empRow?.early_clock_in ?? false}
      />
    </div>
  )
}
