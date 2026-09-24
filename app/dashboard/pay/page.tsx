import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { PayView } from '@/components/PayView'

export default async function PayPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')

  const { data: payslips } = await supabaseAdmin
    .from('payslips')
    .select('id, pay_date, pay_period_start, pay_period_end, pay_schedule, hours_worked, rate, gross_pay, deductions, net_pay, pto_balance, status, applied_at')
    .eq('employee_id', session.user.id)
    .eq('status', 'applied')
    .order('pay_date', { ascending: false })

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Pay View</h1>
        <p className="page-subtitle">Your payslips. Click any row to download the PDF.</p>
      </div>
      <PayView payslips={payslips ?? []} />
    </div>
  )
}
