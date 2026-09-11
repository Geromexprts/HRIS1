import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { laToday, isPayPeriodLocked } from '@/lib/dates'

function calcTotalHours(clockIn: string, clockOut: string) {
  const totalMs = new Date(clockOut).getTime() - new Date(clockIn).getTime()
  return Math.max(0, Math.round((totalMs / 3600000 - 1) * 100) / 100)
}


export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { action } = await req.json()
  const employeeId = session.user.id
  const now = new Date().toISOString()
  const today = laToday()

  const { data: existing } = await supabaseAdmin
    .from('time_entries')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('date', today)
    .single()

  if (action === 'clock_in') {
    if (existing) return NextResponse.json({ error: 'Already clocked in today' }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from('time_entries')
      .insert({ employee_id: employeeId, date: today, clock_in: now, breaks: [] })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  if (!existing) return NextResponse.json({ error: 'No active entry for today' }, { status: 400 })

  if (action === 'clock_out') {
    const totalHours = calcTotalHours(existing.clock_in, now)

    const { data, error } = await supabaseAdmin
      .from('time_entries')
      .update({ clock_out: now, total_hours: totalHours })
      .eq('id', existing.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  if (action === 'resume') {
    if (!existing.clock_out) return NextResponse.json({ error: 'Not clocked out' }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from('time_entries')
      .update({ clock_out: null, total_hours: null })
      .eq('id', existing.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

// Edit an existing time entry — logs original values to audit_log before saving
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { entryId, clock_in, clock_out, edit_note } = await req.json()

  // Fetch the existing entry and verify ownership
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('time_entries')
    .select('*')
    .eq('id', entryId)
    .eq('employee_id', session.user.id)
    .single()

  if (fetchError || !existing) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })

  // Enforce pay period lock — but never block an active (not yet clocked out) entry
  if (existing.clock_out && isPayPeriodLocked(existing.date)) {
    return NextResponse.json({ error: 'This pay period is locked and cannot be edited.' }, { status: 403 })
  }

  // Log the original values to audit_log before overwriting
  await supabaseAdmin.from('audit_log').insert({
    employee_id: session.user.id,
    action: 'time_entry_edited',
    details: {
      entry_id: entryId,
      date: existing.date,
      original: { clock_in: existing.clock_in, clock_out: existing.clock_out, total_hours: existing.total_hours },
      updated: { clock_in, clock_out },
      edit_note: edit_note ?? null,
    },
  })

  // Recalculate total hours with edited times
  const totalHours = clock_in && clock_out
    ? calcTotalHours(clock_in, clock_out)
    : existing.total_hours

  const { data, error } = await supabaseAdmin
    .from('time_entries')
    .update({
      clock_in,
      clock_out,
      total_hours: totalHours,
      is_edited: true,
      edit_note: edit_note ?? null,
    })
    .eq('id', entryId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
