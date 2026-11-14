import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { NextResponse } from 'next/server'

const LA_TZ = 'America/Los_Angeles'

function laHour(iso: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: LA_TZ, hour: '2-digit', hour12: false,
  }).formatToParts(new Date(iso))
  return parseInt(parts.find(p => p.type === 'hour')?.value ?? '0')
}

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
  const { date, ot_hours: rawHours, reason } = body

  if (!date || !rawHours) {
    return NextResponse.json({ error: 'date and ot_hours are required' }, { status: 400 })
  }

  const ot_hours = Math.round(parseFloat(rawHours) * 100) / 100
  if (ot_hours <= 0 || ot_hours > 10) {
    return NextResponse.json({ error: 'OT hours must be between 0.5 and 10' }, { status: 400 })
  }

  // Past-date OT requires admin unlock
  const todayLA = new Intl.DateTimeFormat('en-CA', { timeZone: LA_TZ }).format(new Date())
  if (date < todayLA) {
    const { data: unlock } = await supabaseAdmin
      .from('ot_date_unlocks')
      .select('id')
      .eq('employee_id', session.user.id)
      .eq('date', date)
      .maybeSingle()

    if (!unlock) {
      return NextResponse.json(
        { error: 'OT for past dates must be unlocked by an admin. Please contact your manager.' },
        { status: 403 }
      )
    }
  }

  const { data, error } = await supabaseAdmin
    .from('ot_requests')
    .insert({
      employee_id: session.user.id,
      date,
      ot_hours,
      ot_start_time: null,
      ot_end_time: null,
      reason: reason || null,
      status: 'pending',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// A5: employee can cancel a denied OT request and resubmit
export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { requestId } = await req.json()
  if (!requestId) return NextResponse.json({ error: 'requestId is required' }, { status: 400 })

  const { data: existing } = await supabaseAdmin
    .from('ot_requests')
    .select('id, status, employee_id')
    .eq('id', requestId)
    .single()

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.employee_id !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!['denied', 'pending'].includes(existing.status)) return NextResponse.json({ error: 'Only pending or denied requests can be cancelled' }, { status: 400 })

  const { error } = await supabaseAdmin.from('ot_requests').delete().eq('id', requestId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
