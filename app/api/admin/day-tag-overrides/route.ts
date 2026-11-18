import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

const VALID_TAGS = ['off', 'paid_leave', 'unpaid_leave', 'missing']

// GET /api/admin/day-tag-overrides?employee_id=&from=&to=
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const employee_id = req.nextUrl.searchParams.get('employee_id')
  const from = req.nextUrl.searchParams.get('from')
  const to = req.nextUrl.searchParams.get('to')
  if (!employee_id || !from || !to) return NextResponse.json({ error: 'employee_id, from, to required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('day_tag_overrides')
    .select('id, date, tag, overridden_by, created_at')
    .eq('employee_id', employee_id)
    .gte('date', from)
    .lte('date', to)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST /api/admin/day-tag-overrides — upsert a tag override
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { employee_id, date, tag } = await req.json()

  if (!employee_id || !date) return NextResponse.json({ error: 'employee_id and date required' }, { status: 400 })

  // null tag = remove override
  if (tag === null) {
    await supabaseAdmin.from('day_tag_overrides').delete().eq('employee_id', employee_id).eq('date', date)
    return NextResponse.json({ ok: true })
  }

  if (!VALID_TAGS.includes(tag)) {
    return NextResponse.json({ error: `tag must be one of: ${VALID_TAGS.join(', ')}` }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('day_tag_overrides')
    .upsert({ employee_id, date, tag, overridden_by: session.user.id }, { onConflict: 'employee_id,date' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
