import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { PrintClient } from './PrintClient'

export default async function PayslipPrintPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')

  const { id } = await params

  const { data: payslip } = await supabaseAdmin
    .from('payslips')
    .select('*, employees(id, name, work_email, employment_start_date, pto_policy)')
    .eq('id', id)
    .single()

  if (!payslip) redirect('/dashboard')

  const isAdmin = session.user.role === 'admin'
  const isOwner = payslip.employee_id === session.user.id
  if (!isAdmin && !isOwner) redirect('/dashboard')
  if (!isAdmin && isOwner && payslip.status !== 'applied') redirect('/dashboard/pay')

  const emp = payslip.employees as {
    id: string
    name: string
    work_email: string
    employment_start_date: string | null
    pto_policy: string | null
  } | null

  const ptoUnit = emp?.pto_policy === 'placed_staff' ? 'hrs' : 'days'

  return <PrintClient payslip={payslip} employee={emp} ptoUnit={ptoUnit} />
}
