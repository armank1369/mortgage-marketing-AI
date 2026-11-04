import test from 'node:test'
import assert from 'node:assert/strict'
import { calendarEntry, wireEntry } from './schedule.js'

test('workspace entries keep the scheduled day and time across device timezones', () => {
  const entry = calendarEntry({ id:'abc', timezone:'America/Los_Angeles', scheduled_for:'2026-11-04T01:00:00Z', status:'planned' })
  assert.equal(entry.date.getDate(),3)
  assert.equal(entry.time,'5:00 PM')
  assert.equal(entry.status,'Scheduled')
  const saved = wireEntry({ ...entry, original: entry })
  assert.equal(saved.scheduled_for,'2026-11-04T01:00:00Z')
  assert.equal(saved.timezone,'America/Los_Angeles')
})

test('manual local entries retain date, distinguish untimed from midnight and reject ambiguous times', () => {
  const entry = { date: new Date(2026,10,3), time:'12:30 PM' }
  assert.equal(new Date(wireEntry(entry).scheduled_for).getHours(),12)
  assert.equal(wireEntry({...entry,time:''}).untimed,true)
  assert.equal(wireEntry({...entry,time:'12:00 AM'}).untimed,false)
  assert.throws(() => wireEntry({...entry,time:'after lunch'}))
})
