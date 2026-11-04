import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useBrowserScope } from './BrowserScope'
import { useWorkspaceAccess } from './WorkspaceAccess'
import { loadCalendarEntriesFromStorage } from '../utils/storage'
import { workspaceApi } from '../lib/api'
import { calendarEntry, loadSchedule, wireEntry } from '../lib/schedule'

const CalendarContext = createContext(null)
// eslint-disable-next-line react/only-export-components
export function useCalendar() {
  const value = useContext(CalendarContext)
  if (!value) throw Error('useCalendar must be used within a CalendarProvider')
  return value
}

export function CalendarProvider({ children }) {
  const scope = useBrowserScope()
  const { role } = useWorkspaceAccess()
  const key = 'lucie_schedule_v1:' + scope
  const [data, setData] = useState(() => loadSchedule(key))
  const current = useRef(data)
  const active = useRef(null)
  const writing = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [imported, setImported] = useState(() => {
    try { return !!localStorage.getItem(key + ':imported') } catch { return false }
  })
  const legacy = useMemo(() => imported ? [] : (loadCalendarEntriesFromStorage(scope) || []).filter(e => !String(e.id).startsWith('seed-')), [scope, imported])
  const canWrite = ['member','developer','owner','admin'].includes(role)
  const refresh = useCallback(async () => {
    const signal = active.current?.signal
    if (!signal || signal.aborted) return
    const cached = current.current
    try {
      const result = await workspaceApi.send({ url: '/api/calendar', method: 'GET', signal,
        headers: cached ? { 'If-None-Match': '"' + cached.revision + '"' } : {},
        validateStatus: status => status === 200 || status === 304 }, { expectedScope: scope })
      if (signal.aborted) return
      if (result.status !== 304 && (!current.current || BigInt(result.data.revision) >= BigInt(current.current.revision))) {
        current.current = result.data
        setData(result.data)
        try { localStorage.setItem(key, JSON.stringify(result.data)) } catch { /* Keep in-memory snapshot. */ }
      }
      setError('')
      return true
    } catch (err) {
      if (!signal.aborted && [401,403].includes(err.response?.status)) {
        current.current = null
        setData(null)
        try { localStorage.removeItem(key) } catch { /* Access is still denied. */ }
      }
      if (!signal.aborted) setError('Calendar could not sync. Any cached entries may be out of date.')
      return false
    }
  }, [scope,key])

  useEffect(() => {
    const controller = new AbortController()
    active.current = controller
    refresh()
    window.addEventListener('focus', refresh)
    return () => { controller.abort(); window.removeEventListener('focus', refresh) }
  }, [refresh])

  const mutate = async (action, prepare, expectedRevision) => {
    if (!canWrite || writing.current) return false
    writing.current = true
    setBusy(true)
    const signal = active.current.signal
    try {
      if (!current.current && !await refresh()) return false
      const revision = expectedRevision ?? current.current.revision
      await workspaceApi.send({ url: '/api/calendar', method: 'POST', signal,
        headers: { 'If-Match': '"' + revision + '"' }, data: { action, ...prepare() } }, { expectedScope: scope })
      return !!await refresh()
    } catch (err) {
      if (signal.aborted) return false
      if (err.response?.status === 409) {
        await refresh()
        setError('The schedule changed. Review the calendar and try again.')
      } else setError(err.response?.data?.message || err.message || 'Calendar save could not be confirmed.')
      return false
    } finally { writing.current = false; if (!signal.aborted) setBusy(false) }
  }
  const entries = useMemo(() => (data?.entries || []).map(calendarEntry), [data])
  const remove = ids => mutate('remove', () => ({ ids }))
  const importLegacy = async () => {
    for (let start = 0; start < legacy.length; start += 50) {
      if (!await mutate('import', () => ({ entries: legacy.slice(start, start + 50).map(wireEntry) }))) return
    }
    setImported(true)
    try { localStorage.setItem(key + ':imported', 'yes') } catch { /* Stable IDs protect retries. */ }
  }
  return <CalendarContext.Provider value={{ entries, error, revision: data?.revision, refresh, legacy, importLegacy, canWrite: canWrite && !busy,
    addEntry: entry => mutate('manual', () => ({ entries: [wireEntry(entry)] })),
    moveEntry: (id, entry, revision) => mutate('move', () => ({ id, entry: wireEntry(entry) }), revision),
    removeEntry: id => remove([id]), clearEntries: match => remove(entries.filter(match).map(e => e.id)),
    isBatchSaved: batch => entries.some(e => e.batchId === batch),
    upsertEntries: (batch, rows, revision) => mutate('save', () => ({ batch, entries: rows.map(wireEntry) }), revision) }}>
    {error && <p role="alert" className="bg-amber-50 p-2 text-sm">{error}</p>}
    {children}
  </CalendarContext.Provider>
}
