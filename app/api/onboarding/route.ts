import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    work_email,
    name,
    date_of_birth,
    home_address,
    personal_email,
    mobile_number,
    employment_start_date,
    emergency_contact_name,
    emergency_contact_phone,
  } = body

  if (!work_email?.trim()) {
    return NextResponse.json({ error: 'Work email is required.' }, { status: 400 })
  }

  const required = { name, date_of_birth, home_address, personal_email, mobile_number, employment_start_date, emergency_contact_name, emergency_contact_phone }
  for (const [field, val] of Object.entries(required)) {
    if (!val?.toString().trim()) {
      return NextResponse.json({ error: `${field.replace(/_/g, ' ')} is required.` }, { status: 400 })
    }
  }

  const { data: emp, error: lookupErr } = await supabaseAdmin
    .from('employees')
    .select('id, name')
    .ilike('work_email', work_email.trim())
    .single()

  if (lookupErr || !emp) {
    return NextResponse.json({ error: 'No active employee found with that work email. Contact HR if this is an error.' }, { status: 404 })
  }

  const { error: updateErr } = await supabaseAdmin
    .from('employees')
    .update({
      name: name.trim(),
      date_of_birth,
      home_address: home_address.trim(),
      personal_email: personal_email.trim().toLowerCase(),
      mobile_number: mobile_number.trim(),
      employment_start_date,
      emergency_contact_name: emergency_contact_name.trim(),
      emergency_contact_phone: emergency_contact_phone.trim(),
    })
    .eq('id', emp.id)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  await supabaseAdmin.from('audit_log').insert({
    employee_id: emp.id,
    action: 'onboarding_form_submitted',
    details: { submitted_via: 'onboarding_form', fields_updated: Object.keys(required) },
    performed_at: new Date().toISOString(),
  })

  return NextResponse.json({ ok: true, name: emp.name })
}
