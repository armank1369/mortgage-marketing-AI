import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildMonthGrid, weekDays, groupByDay, monthStats, timeToMinutes, formatTimeLabel,
  toTimeInputValue, entryIsPast, suggestTimes, fromDateInputValue, toDateInputValue,
} from './calendarView.js'

test('month grid is six Sunday-start weeks covering the month', () => {
  const grid = buildMonthGrid(2026, 10)
  assert.equal(grid.length, 42)
  assert.equal(grid[0].getDay(), 0)
  assert.equal(grid[0].getDate(), 1) // November 1 2026 is a Sunday
  assert.equal(grid[41].getMonth(), 11)
})

test('week days start on Sunday and survive a DST change', () => {
  const days = weekDays(new Date(2026, 10, 4))
  assert.deepEqual(days.map((d) => d.getDate()), [1, 2, 3, 4, 5, 6, 7])
  assert.ok(days.every((d) => d.getHours() === 0))
})

test('time labels round-trip and untimed entries sort last', () => {
  assert.equal(timeToMinutes('12:00 AM'), 0)
  assert.equal(timeToMinutes('12:30 PM'), 750)
  assert.equal(timeToMinutes(''), 1440)
  assert.equal(formatTimeLabel('17:05'), '5:05 PM')
  assert.equal(toTimeInputValue('9:00 AM'), '09:00')
  assert.equal(toTimeInputValue(''), '')
  assert.equal(toDateInputValue(fromDateInputValue('2026-11-03')), '2026-11-03')
})

test('entries group by day in time order', () => {
  const groups = groupByDay([
    { id: 'b', date: new Date(2026, 10, 3), time: '1:00 PM', topic: 'b' },
    { id: 'c', date: new Date(2026, 10, 3), time: '', topic: 'c' },
    { id: 'a', date: new Date(2026, 10, 3), time: '9:00 AM', topic: 'a' },
    { id: 'd', date: new Date(2026, 10, 4), time: '', topic: 'd' },
  ])
  assert.deepEqual(groups.get('2026-11-03').map((e) => e.id), ['a', 'b', 'c'])
  assert.equal(groups.get('2026-11-04').length, 1)
})

test('past detection uses the time on today', () => {
  const now = new Date(2026, 10, 21, 10, 0)
  assert.equal(entryIsPast({ date: new Date(2026, 10, 20), time: '' }, now), true)
  assert.equal(entryIsPast({ date: new Date(2026, 10, 21), time: '9:00 AM' }, now), true)
  assert.equal(entryIsPast({ date: new Date(2026, 10, 21), time: '11:00 AM' }, now), false)
  assert.equal(entryIsPast({ date: new Date(2026, 10, 21), time: '' }, now), false)
})

test('month stats count the month, the next seven days and open weekdays', () => {
  const now = new Date(2026, 10, 21, 10, 0)
  const entries = [
    { date: new Date(2026, 10, 2), time: '', platform: 'LinkedIn', status: 'Completed' },
    { date: new Date(2026, 10, 23), time: '9:00 AM', platform: 'Instagram', status: 'Scheduled' },
    { date: new Date(2026, 10, 24), time: '', platform: 'Instagram', status: 'Scheduled' },
    { date: new Date(2026, 11, 10), time: '', platform: 'LinkedIn', status: 'Scheduled' },
  ]
  const stats = monthStats(entries, new Date(2026, 10, 1), now)
  assert.equal(stats.total, 3)
  assert.equal(stats.published, 1)
  assert.equal(stats.nextSeven, 2)
  assert.equal(stats.next.date.getDate(), 23)
  assert.deepEqual(stats.platforms, [['Instagram', 2], ['LinkedIn', 1]])
  // Weekdays Nov 23-30 are 23,24,25,26,27,30; 23 and 24 are planned.
  assert.deepEqual(stats.gaps.map((d) => d.getDate()), [25, 26, 27, 30])
})

test('suggested times spread across the window', () => {
  assert.deepEqual(suggestTimes(['a', 'b']), ['a', 'b'])
  assert.deepEqual(suggestTimes(['1', '2', '3', '4', '5', '6', '7'], 4), ['1', '3', '5', '7'])
})
