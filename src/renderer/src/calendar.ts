import { toIso } from '../../shared'

export { todayIso } from '../../shared'

// 0 is Sunday. Israeli and Arabic-language calendars start on Sunday; until brands have countries, the language decides.
export const weekStartFor = (brandLanguage: string) => (brandLanguage === 'he' || brandLanguage === 'ar' ? 0 : 1)

// Whole weeks covering the month, so the grid always has a row count divisible by seven.
export function monthGrid(year: number, month: number, weekStart: number): string[] {
  const first = new Date(Date.UTC(year, month, 1))
  const last = new Date(Date.UTC(year, month + 1, 0))
  const leading = (first.getUTCDay() - weekStart + 7) % 7
  const trailing = (weekStart + 6 - last.getUTCDay() + 7) % 7
  const total = leading + last.getUTCDate() + trailing
  return Array.from({ length: total }, (_, i) => toIso(new Date(Date.UTC(year, month, 1 - leading + i))))
}

export const shiftMonth = (year: number, month: number, delta: number) => {
  const d = new Date(Date.UTC(year, month + delta, 1))
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() }
}

export const isInMonth = (iso: string, year: number, month: number) => iso.startsWith(`${year}-${String(month + 1).padStart(2, '0')}-`)
