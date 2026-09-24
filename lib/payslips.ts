export type PaySchedule = '5th' | '12th' | '20th' | '30th'

export const PAY_SCHEDULES: PaySchedule[] = ['5th', '12th', '20th', '30th']

export const PAY_SCHEDULE_LABELS: Record<PaySchedule, string> = {
  '5th':  '5th  (16–EOM prev month)',
  '12th': '12th (1–EOM prev month)',
  '20th': '20th (1–15 current month)',
  '30th': '30th (26–25)',
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

// refYear/refMonth = the month containing the PAY DATE
export function getPayScheduleBounds(
  schedule: PaySchedule,
  refYear: number,
  refMonth: number,
): { periodStart: string; periodEnd: string; payDate: string } {
  const prevMonth = refMonth === 1 ? 12 : refMonth - 1
  const prevYear  = refMonth === 1 ? refYear - 1 : refYear

  switch (schedule) {
    case '5th': {
      const lastDay = daysInMonth(prevYear, prevMonth)
      return {
        periodStart: `${prevYear}-${pad(prevMonth)}-16`,
        periodEnd:   `${prevYear}-${pad(prevMonth)}-${lastDay}`,
        payDate:     `${refYear}-${pad(refMonth)}-05`,
      }
    }
    case '12th': {
      const lastDay = daysInMonth(prevYear, prevMonth)
      return {
        periodStart: `${prevYear}-${pad(prevMonth)}-01`,
        periodEnd:   `${prevYear}-${pad(prevMonth)}-${lastDay}`,
        payDate:     `${refYear}-${pad(refMonth)}-12`,
      }
    }
    case '20th': {
      return {
        periodStart: `${refYear}-${pad(refMonth)}-01`,
        periodEnd:   `${refYear}-${pad(refMonth)}-15`,
        payDate:     `${refYear}-${pad(refMonth)}-20`,
      }
    }
    case '30th': {
      return {
        periodStart: `${prevYear}-${pad(prevMonth)}-26`,
        periodEnd:   `${refYear}-${pad(refMonth)}-25`,
        payDate:     `${refYear}-${pad(refMonth)}-30`,
      }
    }
  }
}
