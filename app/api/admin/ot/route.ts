import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { NextResponse } from 'next/server'
import type { Session } from 'next-auth'

function adminOrApprover(session: Session | null) {
  return session?.user?.role === 'admin' || session?.user?.role === 'approver'
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!adminOrApprover(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let query = supabaseAdmin
    .from('ot_requests')
    .select('*, employees(id, name, work_email)')
    .order('created_at', { ascending: false })

  if (session!.user.role === 'approver') {
    const { data: myTeam } = await supabaseAdmin
      .from('employees')
      .select('id')
      .eq('approver_id', session!.user.id)

    const ids = (myTeam ?? []).map(e => e.id)
    query = ids.length > 0
      ? query.in('employee_id', ids)
      : query.eq('employee_id', 'none-00000000-0000-0000-0000-000000000000')
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions)
  if (!adminOrApprover(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { requestId, action, note } = await req.json()
  if (!requestId || !['approve', 'deny'].includes(action)) {
    return NextResponse.json({ error: 'requestId and action required' }, { status: 400 })
  }

  const { data: existing } = await supabaseAdmin
    .from('ot_requests')
    .select('id, status, employee_id, ot_hours, time_entry_id, date')
    .eq('id', requestId)
    .single()

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.status !== 'pending') return NextResponse.json({ error: 'Already reviewed' }, { status: 409 })

  const { data, error } = await supabaseAdmin
    .from('ot_requests')
    .update({
      status: action === 'approve' ? 'approved' : 'denied',
      reviewed_by: session!.user.email,
      reviewed_at: new Date().toISOString(),
      approver_note: note || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .select('*, employees(id, name, work_email)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Send notification to employee
  await supabaseAdmin.from('notifications').insert({
    employee_id: existing.employee_id,
    title: `OT Request ${action === 'approve' ? 'Approved' : 'Denied'}`,
    body: note ? `Note: ${note}` : `Your OT request has been ${action === 'approve' ? 'approved' : 'denied'}.`,
    link: '/dashboard/time',
  }).select().maybeSingle()

  return NextResponse.json(data)
}
