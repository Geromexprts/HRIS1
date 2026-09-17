import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

function calcTotalHours(clockIn: string, clockOut: string) {
  const totalMs = new Date(clockOut).getTime() - new Date(clockIn).getTime()
  return Math.max(0, Math.round((totalMs / 3600000 - 1) * 100) / 100)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { employee_id, date, clock_in, clock_out, edit_note } = await req.json()
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

  const totalHours = clock_out ? calcTotalHours(clock_in, clock_out) : null

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

  const { entryId, clock_in, clock_out, edit_note } = await req.json()

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
    },
  })

  const totalHours = clock_in && clock_out
    ? calcTotalHours(clock_in, clock_out)
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
