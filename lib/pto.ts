export type AccrualEvent = {
  type: string
  days: number
  date: string
  note: string
}

// Policy: proration based on which month the 6-month anniversary falls in (first year only)
const PRORATION_TABLE: Record<number, number> = {
  1: 9, 2: 8, 3: 8, 4: 7, 5: 6, 6: 5,
  7: 4, 8: 3, 9: 3, 10: 2, 11: 1, 12: 0,
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

  // One-time prorated grant on 6-month anniversary (table-based, not flat)
  const alreadyGranted = accrualHistory.some(e => e.type === 'first_year_grant')
  if (!alreadyGranted) {
    const sixMonthMonth = parseInt(sixMonthDate.split('-')[1])
    const proratedDays = PRORATION_TABLE[sixMonthMonth] ?? 0
    newBalance += proratedDays
    newEvents.push({
      type: 'first_year_grant',
      days: proratedDays,
      date: sixMonthDate,
      note: `${proratedDays}-day prorated PTO grant at 6-month anniversary (eligible ${sixMonthDate.slice(0, 7)})`,
    })
  }

  // Jan 1 annual reset to 10 days — unused balance forfeited, no carryover
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
        newBalance = 10
        newEvents.push({
          type: 'annual_reset',
          days: 10,
          date: jan1,
          note: `Annual PTO reset to 10 days (Jan 1, ${year}) — unused balance forfeited`,
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
