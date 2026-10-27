import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

// GET /api/admin/time?employee_id=&from=&to= — fetch time entries + leave for a specific period
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const employee_id = req.nextUrl.searchParams.get('employee_id')
  const from = req.nextUrl.searchParams.get('from')
  const to = req.nextUrl.searchParams.get('to')
  if (!employee_id || !from || !to) return NextResponse.json({ error: 'employee_id, from, to required' }, { status: 400 })

  const [{ data: entries }, { data: leaves }, { data: otRows }] = await Promise.all([
    supabaseAdmin.from('time_entries').select('*').eq('employee_id', employee_id).gte('date', from).lte('date', to).order('date', { ascending: false }),
    supabaseAdmin.from('leave_requests').select('id, leave_type, start_date, end_date, days_requested, status, created_at, reason, is_half_day, approver_note, reviewed_by').eq('employee_id', employee_id).lte('start_date', to).gte('end_date', from),
    supabaseAdmin.from('ot_requests').select('ot_hours').eq('employee_id', employee_id).eq('status', 'approved').gte('date', from).lte('date', to),
  ])

  const approvedOtHours = Math.round((otRows ?? []).reduce((s, r) => s + (r.ot_hours ?? 0), 0) * 100) / 100
  return NextResponse.json({ entries: entries ?? [], leaveRequests: leaves ?? [], approvedOtHours })
}

function calcTotalHours(clockIn: string, clockOut: string, skipBreak = false) {
  const totalMs = new Date(clockOut).getTime() - new Date(clockIn).getTime()
  return Math.max(0, Math.round((totalMs / 3600000 - (skipBreak ? 0 : 1)) * 100) / 100)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { employee_id, date, clock_in, clock_out, edit_note, skip_break } = await req.json()
  if (!employee_id || !date || !clock_in) {
    return NextResponse.json({ error: 'employee_id, date, and clock_in are required.' }, { status: 400 })
  }

  const { data: existing } = await supabaseAdmin
    .from('time_entries')
    .select('id')
    .eq('employee_id', employee_id)
    .eq('date', date)
    .single()

  if (existing) return NextResponse.json({ error: 'An entry already exists for this employee on this date.' }, { status: 409 })

  const totalHours = clock_out ? calcTotalHours(clock_in, clock_out, skip_break ?? false) : null

  const { data, error } = await supabaseAdmin
    .from('time_entries')
    .insert({ employee_id, date, clock_in, clock_out: clock_out || null, total_hours: totalHours, is_edited: true, edit_note: edit_note || null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabaseAdmin.from('audit_log').insert({
    employee_id,
    action: 'time_entry_added',
    details: { entry_id: data.id, date, clock_in, clock_out: clock_out || null, total_hours: totalHours, added_by: session.user.email, edit_note: edit_note ?? null },
  })

  return NextResponse.json(data, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { entryId, clock_in, clock_out, edit_note, skip_break } = await req.json()

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('time_entries')
    .select('*')
    .eq('id', entryId)
    .single()

  if (fetchError || !existing) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })

  // Log original values to audit_log before overwriting
  await supabaseAdmin.from('audit_log').insert({
    employee_id: existing.employee_id,
    action: 'time_entry_edited',
    details: {
      entry_id: entryId,
      date: existing.date,
      edited_by: session.user.email,
      edited_by_role: 'admin',
      original: { clock_in: existing.clock_in, clock_out: existing.clock_out, total_hours: existing.total_hours },
      updated: { clock_in, clock_out },
      edit_note: edit_note ?? null,
      skip_break: skip_break ?? false,
    },
  })

  const totalHours = clock_in && clock_out
    ? calcTotalHours(clock_in, clock_out, skip_break ?? false)
    : existing.total_hours

  const { data, error } = await supabaseAdmin
    .from('time_entries')
    .update({ clock_in, clock_out, total_hours: totalHours, is_edited: true, edit_note: edit_note ?? null })
    .eq('id', entryId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { entryId } = await req.json()
  if (!entryId) return NextResponse.json({ error: 'entryId is required.' }, { status: 400 })

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('time_entries')
    .select('*')
    .eq('id', entryId)
    .single()

  if (fetchError || !existing) return NextResponse.json({ error: 'Entry not found.' }, { status: 404 })

  const { error } = await supabaseAdmin
    .from('time_entries')
    .delete()
    .eq('id', entryId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabaseAdmin.from('audit_log').insert({
    employee_id: existing.employee_id,
    action: 'time_entry_deleted',
    details: {
      entry_id: entryId,
      date: existing.date,
      clock_in: existing.clock_in,
      clock_out: existing.clock_out,
      total_hours: existing.total_hours,
      deleted_by: session.user.email,
    },
    performed_at: new Date().toISOString(),
  })

  return NextResponse.json({ ok: true })
}
