import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

const ALLOWED_FIELDS = ['early_clock_in', 'no_break_deduction'] as const
type AllowedField = typeof ALLOWED_FIELDS[number]

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json()

  const update: Partial<Record<AllowedField, unknown>> = {}
  for (const field of ALLOWED_FIELDS) {
    if (field in body) update[field] = body[field]
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('employees')
    .update(update)
    .eq('id', id)
    .select('id, early_clock_in, no_break_deduction')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
