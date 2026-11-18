import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

const VALID_LEAVE_TYPES = ['pto', 'unpaid', 'sick', 'holiday', 'emergency']

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const { leave_type } = await req.json()

  if (!leave_type || !VALID_LEAVE_TYPES.includes(leave_type)) {
    return NextResponse.json({ error: `leave_type must be one of: ${VALID_LEAVE_TYPES.join(', ')}` }, { status: 400 })
  }

  const { data: existing } = await supabaseAdmin
    .from('leave_requests')
    .select('id, leave_type')
    .eq('id', id)
    .single()

  if (!existing) return NextResponse.json({ error: 'Leave request not found' }, { status: 404 })

  const { data, error } = await supabaseAdmin
    .from('leave_requests')
    .update({ leave_type })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabaseAdmin.from('audit_log').insert({
    employee_id: session.user.id,
    action: 'leave_type_changed',
    details: {
      leave_id: id,
      from: existing.leave_type,
      to: leave_type,
      changed_by: session.user.email,
    },
  })

  return NextResponse.json(data)
}
