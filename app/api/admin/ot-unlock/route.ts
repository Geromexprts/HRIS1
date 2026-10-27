import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

// GET /api/admin/ot-unlock?employee_id=<id> — list unlocked dates for an employee
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const employee_id = req.nextUrl.searchParams.get('employee_id')
  if (!employee_id) return NextResponse.json({ error: 'employee_id required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('ot_date_unlocks')
    .select('id, date, created_at')
    .eq('employee_id', employee_id)
    .order('date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/admin/ot-unlock — unlock a specific past date for an employee to file OT
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { employee_id, date } = body
  if (!employee_id || !date) return NextResponse.json({ error: 'employee_id and date required' }, { status: 400 })

  // Resolve admin's employee record for unlocked_by
  const { data: adminEmp } = await supabaseAdmin
    .from('employees')
    .select('id')
    .eq('work_email', session.user.email)
    .maybeSingle()

  const { data, error } = await supabaseAdmin
    .from('ot_date_unlocks')
    .upsert({ employee_id, date, unlocked_by: adminEmp?.id ?? null }, { onConflict: 'employee_id,date' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/admin/ot-unlock — revoke an OT date unlock
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { employee_id, date } = body
  if (!employee_id || !date) return NextResponse.json({ error: 'employee_id and date required' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('ot_date_unlocks')
    .delete()
    .eq('employee_id', employee_id)
    .eq('date', date)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
