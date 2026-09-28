import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { NextResponse } from 'next/server'

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
  const { date, ot_hours, reason, time_entry_id } = body

  if (!date || !ot_hours || Number(ot_hours) <= 0) {
    return NextResponse.json({ error: 'date and ot_hours are required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('ot_requests')
    .insert({
      employee_id: session.user.id,
      date,
      ot_hours: Number(ot_hours),
      reason: reason || null,
      time_entry_id: time_entry_id || null,
      status: 'pending',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
