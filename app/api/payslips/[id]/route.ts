import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

// GET /api/payslips/[id]
// Admin: any payslip. Employee: own applied payslip only.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const { data, error } = await supabaseAdmin
    .from('payslips')
    .select('*, employees(id, name, work_email, employment_start_date, pto_policy)')
    .eq('id', id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  const isAdmin = session.user.role === 'admin'
  const isOwner = data.employee_id === session.user.id
  if (!isAdmin && !isOwner) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  if (!isAdmin && isOwner && data.status !== 'applied') return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  return NextResponse.json(data)
}
