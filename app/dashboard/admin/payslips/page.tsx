import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { AdminPayslipsView } from '@/components/AdminPayslipsView'

export default async function AdminPayslipsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (session.user.role !== 'admin') redirect('/dashboard')

  const [{ data: employees }, { data: payslips }] = await Promise.all([
    supabaseAdmin
      .from('employees')
      .select('id, name, work_email')
      .eq('status', 'active')
      .order('name'),
    supabaseAdmin
      .from('payslips')
      .select('*, employees(name, work_email)')
      .order('pay_date', { ascending: false })
      .limit(200),
  ])

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Payslips</h1>
        <p className="page-subtitle">Create and manage employee payslips.</p>
      </div>
      <AdminPayslipsView
        employees={employees ?? []}
        initialPayslips={(payslips ?? []) as PayslipRow[]}
      />
    </div>
  )
}

export type PayslipRow = {
  id: string
  employee_id: string
  pay_date: string
  pay_period_start: string
  pay_period_end: string
  pay_schedule: string
  hours_worked: number
  rate: number | null
  gross_pay: number | null
  deductions: number
  net_pay: number | null
  pto_balance: number | null
  status: string
  applied_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
  employees: { name: string; work_email: string } | null
}
