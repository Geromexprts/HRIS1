import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { NextResponse } from 'next/server'

const LA_TZ = 'America/Los_Angeles'

function laHour(iso: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: LA_TZ, hour: '2-digit', hour12: false,
  }).formatToParts(new Date(iso))
  return parseInt(parts.find(p => p.type === 'hour')?.value ?? '0')
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('ot_requests')
    .select('*')
    .eq('employee_id', session.user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { date, ot_start_time, ot_end_time, reason, time_entry_id } = body

  if (!date || !ot_start_time || !ot_end_time) {
    return NextResponse.json({ error: 'date, ot_start_time, and ot_end_time are required' }, { status: 400 })
  }

  const startMs = new Date(ot_start_time).getTime()
  const endMs = new Date(ot_end_time).getTime()
  if (endMs <= startMs) {
    return NextResponse.json({ error: 'OT end time must be after start time' }, { status: 400 })
  }

  const ot_hours = Math.round(((endMs - startMs) / 3600000) * 100) / 100
  if (ot_hours <= 0) {
    return NextResponse.json({ error: 'OT duration must be greater than 0' }, { status: 400 })
  }

  // A3: validate end time does not exceed actual clock-out
  if (time_entry_id) {
    const { data: entry } = await supabaseAdmin
      .from('time_entries')
      .select('clock_out')
      .eq('id', time_entry_id)
      .single()

    if (entry?.clock_out && new Date(ot_end_time) > new Date(entry.clock_out)) {
      return NextResponse.json({ error: 'OT end time cannot be later than your actual clock-out time' }, { status: 400 })
    }
  }

  // A4: early clock-in does not count toward OT — start must be at or after 8 AM LA time
  const { data: empRow } = await supabaseAdmin
    .from('employees')
    .select('early_clock_in')
    .eq('id', session.user.id)
    .single()

  if (empRow?.early_clock_in && laHour(ot_start_time) < 8) {
    return NextResponse.json({ error: 'OT start time cannot be before 8:00 AM — early clock-in hours do not count toward overtime' }, { status: 400 })
  }

  // Past-date OT requires admin unlock
  const todayLA = new Intl.DateTimeFormat('en-CA', { timeZone: LA_TZ }).format(new Date())
  if (date < todayLA) {
    const { data: unlock } = await supabaseAdmin
      .from('ot_date_unlocks')
      .select('id')
      .eq('employee_id', session.user.id)
      .eq('date', date)
      .maybeSingle()

    if (!unlock) {
      return NextResponse.json(
        { error: 'OT for past dates must be unlocked by an admin. Please contact your manager.' },
        { status: 403 }
      )
    }
  }

  const { data, error } = await supabaseAdmin
    .from('ot_requests')
    .insert({
      employee_id: session.user.id,
      date,
      ot_hours,
      ot_start_time,
      ot_end_time,
      reason: reason || null,
      time_entry_id: time_entry_id || null,
      status: 'pending',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// A5: employee can cancel a denied OT request and resubmit
export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { requestId } = await req.json()
  if (!requestId) return NextResponse.json({ error: 'requestId is required' }, { status: 400 })

  const { data: existing } = await supabaseAdmin
    .from('ot_requests')
    .select('id, status, employee_id')
    .eq('id', requestId)
    .single()

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.employee_id !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!['denied', 'pending'].includes(existing.status)) return NextResponse.json({ error: 'Only pending or denied requests can be cancelled' }, { status: 400 })

  const { error } = await supabaseAdmin.from('ot_requests').delete().eq('id', requestId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
