import test from 'node:test'
import assert from 'node:assert/strict'
import { canSeeInsights, changeLabel, formatNumber, formatRate, importSummary, performanceMessage, rateChange, validateImportFile } from './insights.js'

test('only account runners see insights', () => {
  assert.equal(canSeeInsights('owner'), true)
  assert.equal(canSeeInsights('admin'), true)
  assert.equal(canSeeInsights('member'), false)
  assert.equal(canSeeInsights('viewer'), false)
  assert.equal(canSeeInsights('developer', 'production'), false)
  assert.equal(canSeeInsights('developer', 'test'), true)
})

test('number and change formatting', () => {
  assert.equal(formatNumber(1204), '1,204')
  assert.equal(formatNumber(12500), '12.5k')
  assert.equal(formatNumber(null), '—')
  assert.equal(formatRate(4.43), '4.43%')
  assert.deepEqual(changeLabel(25), { text: '+25% vs previous period', tone: 'up' })
  assert.deepEqual(changeLabel(-10).tone, 'down')
  assert.equal(changeLabel(null).text, 'No earlier data')
  assert.equal(rateChange(4.43, 3.12), 1.31)
  assert.equal(rateChange(4.43, null), null)
})

test('import file checks and summary', () => {
  assert.match(validateImportFile({ name: 'content.xlsx', size: 10 }), /Excel/)
  assert.match(validateImportFile({ name: 'a.pdf', size: 10, type: 'application/pdf' }), /csv/)
  assert.match(validateImportFile({ name: 'a.csv', size: 3 * 1024 * 1024 }), /2 MB/)
  assert.equal(validateImportFile({ name: 'a.csv', size: 10 }), '')
  assert.equal(importSummary({ imported: 3, updated: 1, matched: 2, skipped: 1, platform: 'Instagram' }),
    '3 new and 1 updated Instagram posts, 2 matched to Lucie calendar posts, 1 rows skipped (no date or numbers).')
  assert.match(performanceMessage({ reason: 'no_imports' }), /Import/)
  assert.equal(performanceMessage({ available: true }), '')
})
