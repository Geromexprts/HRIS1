export type AccrualEvent = {
  type: string
  days: number
  date: string
  note: string
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setMonth(d.getMonth() + months)
  return d.toISOString().split('T')[0]
}

export function computeAccrualUpdates(params: {
  employmentStartDate: string   // 'YYYY-MM-DD'
  currentBalance: number
  lastAccrualDate: string | null
  accrualHistory: AccrualEvent[]
}): {
  newBalance: number
  newLastAccrualDate: string | null
  newAccrualHistory: AccrualEvent[]
  hasChanges: boolean
} {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
  const { employmentStartDate, currentBalance, lastAccrualDate, accrualHistory } = params

  const sixMonthDate = addMonths(employmentStartDate, 6)

  // Not yet at the 6-month mark — no PTO yet
  if (today < sixMonthDate) {
    return { newBalance: currentBalance, newLastAccrualDate: lastAccrualDate, newAccrualHistory: accrualHistory, hasChanges: false }
  }

  let newBalance = currentBalance
  const newEvents: AccrualEvent[] = []

  // Step 1: One-time 8-day grant on 6-month anniversary
  const alreadyGranted = accrualHistory.some(e => e.type === 'first_year_grant')
  if (!alreadyGranted) {
    newBalance += 8
    newEvents.push({
      type: 'first_year_grant',
      days: 8,
      date: sixMonthDate,
      note: '8-day PTO grant at 6-month anniversary',
    })
  }

  // Step 2: January 1 annual reset to 8 days (every year after the grant was given)
  // Policy: no carryover — unused days expire Dec 31, balance resets to 8 on Jan 1
  const grantGiven = alreadyGranted || newEvents.some(e => e.type === 'first_year_grant')
  if (grantGiven) {
    const eligibilityYear = parseInt(sixMonthDate.split('-')[0])
    const todayYear = parseInt(today.split('-')[0])

    for (let year = eligibilityYear + 1; year <= todayYear; year++) {
      const jan1 = `${year}-01-01`
      if (jan1 > today) break

      const alreadyReset = [...accrualHistory, ...newEvents].some(
        e => e.type === 'annual_reset' && e.date.startsWith(`${year}-`)
      )
      if (!alreadyReset) {
        newBalance = 8
        newEvents.push({
          type: 'annual_reset',
          days: 8,
          date: jan1,
          note: `Annual PTO reset to 8 days (Jan 1, ${year})`,
        })
      }
    }
  }

  if (newEvents.length === 0) {
    return { newBalance: currentBalance, newLastAccrualDate: lastAccrualDate, newAccrualHistory: accrualHistory, hasChanges: false }
  }

  const lastEvent = newEvents[newEvents.length - 1]
  return {
    newBalance,
    newLastAccrualDate: lastEvent.date,
    newAccrualHistory: [...accrualHistory, ...newEvents],
    hasChanges: true,
  }
}
