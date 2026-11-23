// Pure helpers for the Insights page, kept separate so they can be tested without a browser.
export const PERIODS = [[7, '7 days'], [30, '30 days'], [90, '90 days']]
export const IMPORT_PLATFORMS = ['Instagram', 'Facebook', 'LinkedIn']
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024
export const INSIGHTS_ROLES = ['owner', 'admin']

export const canSeeInsights = (role, environment) =>
  INSIGHTS_ROLES.includes(role) || (role === 'developer' && ['development', 'test'].includes(environment))

export function formatNumber(value) {
  if (value === null || value === undefined) return '—'
  if (Math.abs(value) >= 10000) return `${(value / 1000).toFixed(value >= 100000 ? 0 : 1)}k`
  return value.toLocaleString('en-US')
}

export const formatRate = (value) => (value === null || value === undefined ? '—' : `${value}%`)

// "+12% vs previous" style delta; neutral when there is nothing to compare against.
export function changeLabel(changePct) {
  if (changePct === null || changePct === undefined) return { text: 'No earlier data', tone: 'neutral' }
  if (changePct === 0) return { text: 'Same as previous period', tone: 'neutral' }
  return { text: `${changePct > 0 ? '+' : ''}${changePct}% vs previous period`, tone: changePct > 0 ? 'up' : 'down' }
}

export function rateChange(current, previous) {
  if (current === null || current === undefined || previous === null || previous === undefined) return null
  return Math.round((current - previous) * 100) / 100
}

export function validateImportFile(file) {
  if (!file) return 'Choose a file first.'
  if (/\.xlsx?$/i.test(file.name)) return 'This is an Excel file. Open it and save the posts sheet as CSV, then upload that.'
  if (!/\.csv$/i.test(file.name) && file.type !== 'text/csv') return 'Upload the export as a .csv file.'
  if (file.size > MAX_IMPORT_BYTES) return 'The file is larger than 2 MB. Export a shorter date range.'
  return ''
}

export function importSummary(result) {
  const parts = [`${result.imported} new and ${result.updated} updated ${result.platform} posts`]
  parts.push(`${result.matched} matched to Lucie calendar posts`)
  if (result.skipped) parts.push(`${result.skipped} rows skipped (no date or numbers)`)
  return parts.join(', ') + '.'
}

export const performanceMessage = (performance) => ({
  not_installed: 'Performance imports are not switched on yet. An administrator needs to apply the Insights database update.',
  no_imports: 'Import a Meta Business Suite or LinkedIn export to see reach and engagement here.',
  none_in_period: 'No imported posts fall in this period. Import a newer export or pick a longer period.',
})[performance?.reason] || ''

export function deviceTimezone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles' } catch { return 'America/Los_Angeles' }
}
