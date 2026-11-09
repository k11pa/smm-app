import { describe, expect, it } from 'vitest'
import { isInMonth, monthGrid, shiftMonth, todayIso, weekStartFor } from './calendar'

describe('monthGrid', () => {
  it('starts and ends on whole weeks, Monday first', () => {
    const grid = monthGrid(2026, 10, 1) // November 2026 starts on a Sunday
    expect(grid[0]).toBe('2026-10-26')
    expect(grid[grid.length - 1]).toBe('2026-12-06')
    expect(grid.length % 7).toBe(0)
  })

  it('starts on Sunday for a Sunday-first week', () => {
    const grid = monthGrid(2026, 10, 0)
    expect(grid[0]).toBe('2026-11-01')
    expect(grid[grid.length - 1]).toBe('2026-12-05')
  })

  it('handles a leap February and needs no padding when the month fills the weeks', () => {
    expect(monthGrid(2028, 1, 1)).toContain('2028-02-29')
    const feb2027 = monthGrid(2027, 1, 1) // starts Monday, 28 days
    expect(feb2027).toHaveLength(28)
    expect(feb2027[0]).toBe('2027-02-01')
  })

  it('has no gaps or repeats across a year boundary', () => {
    const grid = monthGrid(2026, 11, 1)
    expect(new Set(grid).size).toBe(grid.length)
    expect(grid[grid.length - 1] > '2026-12-31').toBe(true)
    expect(grid).toContain('2027-01-01')
  })
})

describe('helpers', () => {
  it('moves across year boundaries', () => {
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 })
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 })
  })

  it('knows which days belong to the month', () => {
    expect(isInMonth('2026-11-30', 2026, 10)).toBe(true)
    expect(isInMonth('2026-12-01', 2026, 10)).toBe(false)
  })

  it('picks the week start from the brand language', () => {
    expect(weekStartFor('he')).toBe(0)
    expect(weekStartFor('ru')).toBe(1)
  })

  it('uses the local calendar day for today', () => {
    expect(todayIso(new Date(2026, 10, 9, 23, 59))).toBe('2026-11-09')
  })
})
