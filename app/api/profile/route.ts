import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { date_of_birth, home_address, personal_email, mobile_number, emergency_contact_name, emergency_contact_phone } = body

  const update: Record<string, string | null> = {
    date_of_birth: date_of_birth?.trim() || null,
    home_address: home_address?.trim() || null,
    personal_email: personal_email?.trim() || null,
    mobile_number: mobile_number?.trim() || null,
    emergency_contact_name: emergency_contact_name?.trim() || null,
    emergency_contact_phone: emergency_contact_phone?.trim() || null,
  }

  const { error } = await supabaseAdmin
    .from('employees')
    .update(update)
    .eq('id', session.user.id)

  if (error) return NextResponse.json({ error: 'Failed to save.' }, { status: 500 })

  await supabaseAdmin.from('audit_log').insert({
    employee_id: session.user.id,
    action: 'personal_info_updated',
    details: { updated_by: session.user.email },
    performed_at: new Date().toISOString(),
  })

  return NextResponse.json({ ok: true })
}
