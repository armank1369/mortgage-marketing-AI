import { useCallback, useEffect, useRef, useState } from 'react'
import { workspaceApi, apiErrorMessage } from '../lib/api.js'
import { scopedRequest } from '../lib/workspaceConfiguration.js'
import { useBrowserScope } from '../context/BrowserScope.js'
import {
  PERIODS, IMPORT_PLATFORMS, changeLabel, deviceTimezone, formatNumber, formatRate, importSummary,
  performanceMessage, rateChange, validateImportFile,
} from '../lib/insights.js'

const card = 'rounded-xl border border-slate-200 bg-white p-4'
const subtle = 'text-xs text-slate-500'
const TONES = { up: 'text-emerald-700', down: 'text-rose-700', neutral: 'text-slate-500' }
const FLAG_STYLES = {
  warn: ['bg-amber-50 border-amber-200 text-amber-900', '⚠️'],
  info: ['bg-slate-50 border-slate-200 text-slate-700', 'ℹ️'],
  good: ['bg-emerald-50 border-emerald-200 text-emerald-900', '✅'],
}

function Stat({ label, value, detail, tone = 'neutral', hint }) {
  return <div className={card} title={hint}>
    <p className={subtle}>{label}</p>
    <p className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">{value}</p>
    {detail && <p className={`mt-1 text-xs ${TONES[tone]}`}>{detail}</p>}
  </div>
}

// Single-series horizontal bars: one hue, value labels in text ink, hover shows the exact figure.
function Bars({ title, rows, value = (r) => r.count, label = (r) => r.label, format = formatNumber, note }) {
  const max = Math.max(1, ...rows.map((r) => value(r) || 0))
  return <section className={card}>
    <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
    {note && <p className={`${subtle} mt-0.5`}>{note}</p>}
    {!rows.length ? <p className={`${subtle} mt-3`}>Nothing in this period.</p> :
      <ul className="mt-3 space-y-2">{rows.map((row) => {
        const v = value(row)
        return <li key={label(row)} className="grid grid-cols-[6.5rem_1fr_3.5rem] items-center gap-2 text-xs" title={`${label(row)}: ${format(v)}`}>
          <span className="truncate text-slate-700">{label(row)}</span>
          <span className="h-3 rounded-r bg-slate-100"><span className="block h-3 rounded-r bg-blue-600" style={{ width: `${v ? Math.max(2, (v / max) * 100) : 0}%` }} /></span>
          <span className="text-right tabular-nums text-slate-700">{format(v)}</span>
        </li>
      })}</ul>}
  </section>
}

function Analysis({ report, busy, error, onRun, hasData }) {
  return <section className={`${card} border-blue-200`}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Lucie's review</h3>
        <p className={subtle}>{report ? `Written ${new Date(report.created_at).toLocaleString()}${report.outdated ? ' · numbers have changed since' : ''}` : 'Lucie reads the numbers on this page and points out what is working, what is slipping and what to do next.'}</p>
      </div>
      <button type="button" disabled={busy || !hasData} onClick={onRun} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
        {busy ? 'Reviewing…' : report ? 'Refresh review' : 'Write review'}
      </button>
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
    {report && <div className="mt-4 space-y-4 text-sm text-slate-800">
      <p className="font-medium text-slate-900">{report.analysis.headline}</p>
      <div className="grid gap-4 md:grid-cols-2">
        <div><h4 className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Working</h4>
          <ul className="mt-1 list-disc space-y-1 pl-4">{report.analysis.working.map((t) => <li key={t}>{t}</li>)}</ul></div>
        <div><h4 className="text-xs font-semibold uppercase tracking-wide text-amber-700">Needs attention</h4>
          <ul className="mt-1 list-disc space-y-1 pl-4">{report.analysis.concerns.map((t) => <li key={t}>{t}</li>)}</ul></div>
      </div>
      <div><h4 className="text-xs font-semibold uppercase tracking-wide text-blue-700">Next steps</h4>
        <ol className="mt-1 list-decimal space-y-1 pl-4">{report.analysis.next_actions.map((a) => <li key={a.action}><span className="font-medium">{a.action}</span> <span className="text-slate-600">{a.why}</span></li>)}</ol></div>
      {report.analysis.data_gaps.length > 0 && <p className={subtle}>Missing data: {report.analysis.data_gaps.join(' ')}</p>}
    </div>}
  </section>
}

function ImportPanel({ scope, onImported }) {
  const [platform, setPlatform] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState({ text: '', error: false })
  const input = useRef(null)
  const upload = async () => {
    const file = input.current?.files?.[0]
    const problem = validateImportFile(file)
    if (problem) return setMessage({ text: problem, error: true })
    setBusy(true); setMessage({ text: '', error: false })
    try {
      const text = await file.text()
      const result = await scopedRequest(workspaceApi, scope, undefined, '/api/insights/imports', 'POST',
        { text, timezone: deviceTimezone(), platform: platform || null })
      setMessage({ text: importSummary(result), error: false })
      if (input.current) input.current.value = ''
      onImported()
    } catch (err) {
      setMessage({ text: apiErrorMessage(err, 'The file could not be imported.'), error: true })
    } finally { setBusy(false) }
  }
  return <details className={card}>
    <summary className="cursor-pointer text-sm font-semibold text-slate-900">Import post results</summary>
    <div className="mt-3 space-y-3 text-sm text-slate-700">
      <ul className="list-disc space-y-1 pl-4 text-xs text-slate-600">
        <li><b>Instagram and Facebook:</b> Meta Business Suite → Insights → Content → Export data → choose posts and CSV.</li>
        <li><b>LinkedIn:</b> Page → Analytics → Content → Export. Open the file and save the "All posts" sheet as CSV.</li>
        <li>Importing the same file again updates the numbers rather than duplicating posts.</li>
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <input ref={input} type="file" accept=".csv,text/csv" aria-label="Export file" className="text-xs" />
        <select value={platform} onChange={(e) => setPlatform(e.target.value)} aria-label="Platform" className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
          <option value="">Detect platform</option>
          {IMPORT_PLATFORMS.map((p) => <option key={p}>{p}</option>)}
        </select>
        <button type="button" onClick={upload} disabled={busy} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-50">{busy ? 'Importing…' : 'Import'}</button>
      </div>
      {message.text && <p role={message.error ? 'alert' : 'status'} className={`text-xs ${message.error ? 'text-rose-700' : 'text-emerald-700'}`}>{message.text}</p>}
    </div>
  </details>
}

function Performance({ performance }) {
  const message = performanceMessage(performance)
  if (!performance?.available || message) return <p className={`${card} text-sm text-slate-600`}>{message}</p>
  const k = performance.kpis
  const rateDelta = rateChange(k.engagement_rate.value, k.engagement_rate.previous)
  const reach = changeLabel(k.reach.change_pct)
  const engagement = changeLabel(k.engagement.change_pct)
  const lucie = performance.lucie_vs_other
  return <div className="space-y-4">
    {performance.stale_days > 7 && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">The newest imported post is from {performance.latest_post_day}. Import a fresh export for up-to-date numbers.</p>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="Reach" value={formatNumber(k.reach.value)} detail={reach.text} tone={reach.tone} />
      <Stat label="Engagements" value={formatNumber(k.engagement.value)} detail={engagement.text} tone={engagement.tone} hint="Likes, comments, shares and saves" />
      <Stat label="Engagement rate" value={formatRate(k.engagement_rate.value)} hint="Engagements divided by reach (impressions where reach is missing)"
        detail={rateDelta === null ? 'No earlier data' : `${rateDelta > 0 ? '+' : ''}${rateDelta} pts vs previous period`} tone={rateDelta > 0 ? 'up' : rateDelta < 0 ? 'down' : 'neutral'} />
      <Stat label="Posts measured" value={k.posts_measured.value} detail={`${k.matched_to_calendar.value} matched to Lucie's calendar`} />
    </div>
    <div className="grid gap-3 lg:grid-cols-3">
      <Bars title="Engagement rate by platform" rows={performance.by_platform} value={(r) => r.engagement_rate} format={formatRate} />
      <Bars title="Engagement rate by persona" note="Posts matched to Lucie's calendar only" rows={performance.by_persona} value={(r) => r.engagement_rate} format={formatRate} />
      <Bars title="Engagement rate by weekday" rows={performance.by_weekday.filter((r) => r.posts)} value={(r) => r.engagement_rate} format={formatRate} />
    </div>
    <div className="grid gap-3 lg:grid-cols-2">
      <section className={card}>
        <h3 className="text-sm font-semibold text-slate-900">Top posts</h3>
        <ol className="mt-2 space-y-2 text-xs">{performance.top_posts.map((p, i) => <li key={i} className="flex justify-between gap-3">
          <span className="min-w-0"><span className="block truncate text-slate-800">{p.permalink ? <a className="underline" href={p.permalink} target="_blank" rel="noreferrer">{p.caption || 'Untitled post'}</a> : p.caption || 'Untitled post'}</span>
            <span className="text-slate-500">{p.platform} · {p.day}{p.from_lucie ? ' · from Lucie' : ''}</span></span>
          <span className="shrink-0 tabular-nums text-slate-700">{formatRate(p.engagement_rate)}</span></li>)}</ol>
      </section>
      <section className={card}>
        <h3 className="text-sm font-semibold text-slate-900">Lucie posts vs. everything else</h3>
        <table className="mt-2 w-full text-xs"><thead><tr className="text-left text-slate-500"><th className="font-medium">Source</th><th className="font-medium text-right">Posts</th><th className="font-medium text-right">Engagement rate</th></tr></thead>
          <tbody className="tabular-nums text-slate-800">
            <tr><td>Scheduled in Lucie</td><td className="text-right">{lucie.lucie.posts}</td><td className="text-right">{formatRate(lucie.lucie.engagement_rate)}</td></tr>
            <tr><td>Other posts</td><td className="text-right">{lucie.other.posts}</td><td className="text-right">{formatRate(lucie.other.engagement_rate)}</td></tr>
          </tbody></table>
        <p className={`${subtle} mt-2`}>A post counts as Lucie's when it went out on the same day and platform as a calendar slot.</p>
      </section>
    </div>
  </div>
}

export default function InsightsPage() {
  const scope = useBrowserScope()
  const [days, setDays] = useState(30)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [review, setReview] = useState({ busy: false, error: '' })

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError('')
    const query = `/api/insights?days=${days}&tz=${encodeURIComponent(deviceTimezone())}`
    scopedRequest(workspaceApi, scope, controller.signal, query)
      .then((result) => { if (!controller.signal.aborted) setData(result) })
      .catch((err) => { if (!controller.signal.aborted && err.code !== 'ERR_CANCELED') setError(apiErrorMessage(err, 'Insights could not be loaded.')) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [scope, days, revision])

  const runReview = useCallback(async () => {
    setReview({ busy: true, error: '' })
    try {
      const report = await scopedRequest(workspaceApi, scope, undefined, '/api/insights/analysis', 'POST', { days, timezone: deviceTimezone() })
      setData((current) => current && { ...current, report })
      setReview({ busy: false, error: '' })
    } catch (err) {
      setReview({ busy: false, error: apiErrorMessage(err, 'Lucie could not write the review. Try again.') })
    }
  }, [scope, days])

  const k = data?.kpis
  const posts = k && changeLabel(k.posts_scheduled.change_pct)
  const drafts = k && changeLabel(k.drafts_generated.change_pct)
  return <div className="flex min-w-0 flex-1 flex-col">
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
      <div><h2 className="text-sm font-semibold text-slate-900">Insights</h2>
        {data && <p className="text-[11px] text-slate-500">{data.period.start} to {data.period.end}</p>}</div>
      <div role="group" aria-label="Period" className="inline-flex rounded-lg border border-slate-200 p-0.5">
        {PERIODS.map(([value, label]) => <button key={value} type="button" aria-pressed={days === value} onClick={() => setDays(value)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium ${days === value ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:text-slate-900'}`}>{label}</button>)}
      </div>
    </header>
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
        {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
        {loading && !data && <p className={subtle}>Loading insights…</p>}
        {data && <>
          <Analysis report={data.report} busy={review.busy} error={review.error} onRun={runReview} hasData={!loading} />

          {data.flags.length > 0 && <ul className="space-y-2">{data.flags.map((flag) => {
            const [style, icon] = FLAG_STYLES[flag.level] || FLAG_STYLES.info
            return <li key={flag.text} className={`flex gap-2 rounded-lg border px-3 py-2 text-sm ${style}`}><span aria-hidden="true">{icon}</span>{flag.text}</li>
          })}</ul>}

          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Results</h3>
            <Performance performance={data.performance} />
            <ImportPanel scope={scope} onImported={() => setRevision((n) => n + 1)} />
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Content pipeline</h3>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Posts scheduled" value={k.posts_scheduled.value} detail={posts.text} tone={posts.tone} hint="Calendar slots in this period. Lucie cannot yet tell whether each one was actually posted." />
              <Stat label="Posts per week" value={k.posts_per_week.value} detail={`${k.posts_per_week.previous} in the previous period`} />
              <Stat label="Longest gap" value={`${k.longest_gap_days.value} days`} detail="Without anything scheduled" />
              <Stat label={`Next ${k.upcoming.days} days`} value={`${k.upcoming.value} planned`} detail={`${k.upcoming.empty_days} empty days`} tone={k.upcoming.empty_days > k.upcoming.days / 2 ? 'down' : 'neutral'} />
              <Stat label="Drafts Lucie wrote" value={k.drafts_generated.value} detail={drafts.text} tone={drafts.tone} hint="Post and campaign responses in chat" />
              <Stat label="Drafts that reached the calendar" value={formatRate(k.draft_to_calendar_pct.value)} detail={`${k.draft_to_calendar_pct.saved} saved`} />
              <Stat label="Compliance flags" value={k.compliance_flagged.value} detail="Scheduled posts with a review flag" tone={k.compliance_flagged.value ? 'down' : 'neutral'} />
              <Stat label="Active campaigns" value={data.campaigns.length} />
            </div>
            <div className="grid gap-3 lg:grid-cols-3">
              <Bars title="Platform mix" rows={data.mix.platform} />
              <Bars title="Persona mix" rows={data.mix.persona} />
              <Bars title="Scheduled by weekday" rows={data.mix.weekday} />
            </div>
            {data.campaigns.length > 0 && <section className={card}>
              <h3 className="text-sm font-semibold text-slate-900">Campaigns</h3>
              <table className="mt-2 w-full text-xs"><thead><tr className="text-left text-slate-500"><th className="font-medium">Campaign</th><th className="font-medium">Dates</th><th className="font-medium text-right">Posts done / planned</th></tr></thead>
                <tbody className="text-slate-800">{data.campaigns.map((c) => <tr key={c.name + c.start_date}><td className="py-1">{c.name}</td><td>{c.start_date || '—'} to {c.end_date || '—'}</td><td className="text-right tabular-nums">{c.past} / {c.scheduled}</td></tr>)}</tbody></table>
            </section>}
          </section>
        </>}
      </div>
    </div>
  </div>
}
