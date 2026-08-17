import { createContext, useContext, useEffect, useState } from 'react'
import { loadCalendarEntriesFromStorage, saveCalendarEntriesToStorage } from '../utils/storage'

const CalendarContext = createContext(null)

// eslint-disable-next-line react/only-export-components
export function useCalendar() {
  const context = useContext(CalendarContext)
  if (!context) {
    throw new Error('useCalendar must be used within a CalendarProvider')
  }
  return context
}

function seedEntries() {
  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth()
  return [
    { id: 'seed-1', topic: 'Educational reel for first-time buyers', platform: 'Instagram', format: 'video', date: new Date(year, month, 3), status: 'Scheduled' },
    { id: 'seed-2', topic: 'Self-employed success story', platform: 'LinkedIn', format: 'text-only', date: new Date(year, month, 10), status: 'Completed' },
    { id: 'seed-3', topic: 'Home buying tips carousel', platform: 'Instagram', format: 'carousel', date: new Date(year, month, 17), status: 'Upcoming' },
    { id: 'seed-4', topic: 'Lead magnet post', platform: 'Facebook', format: 'single-image', date: new Date(year, month, 24), status: 'Upcoming' },
  ]
}

export function CalendarProvider({ children }) {
  const [entries, setEntries] = useState(() => loadCalendarEntriesFromStorage() || seedEntries())

  useEffect(() => {
    saveCalendarEntriesToStorage(entries)
  }, [entries])

  const addEntry = (entry) => {
    setEntries((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, status: 'Scheduled', ...entry },
    ])
  }

  const addEntries = (newEntries) => {
    setEntries((prev) => [
      ...prev,
      ...newEntries.map((entry, i) => ({
        id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`,
        status: 'Scheduled',
        ...entry,
      })),
    ])
  }

  const removeEntry = (id) => {
    setEntries((prev) => prev.filter((entry) => entry.id !== id))
  }

  // Used by the "Save to Calendar" buttons on AI-generated output (a campaign calendar or a
  // single post), keyed by that message's own id as the batchId. Re-saving the same batch (e.g.
  // after generating a video script for one entry) replaces its prior entries wholesale instead
  // of appending a second copy — addEntry/addEntries above stay untouched for the Calendar
  // page's own manual "+ New Entry" form, which has no batch to reconcile against.
  const upsertEntries = (batchId, newEntries) => {
    setEntries((prev) => [
      ...prev.filter((entry) => entry.batchId !== batchId),
      ...newEntries.map((entry, i) => ({
        status: 'Scheduled',
        ...entry,
        id: `${batchId}-${i}`,
        batchId,
      })),
    ])
  }

  const isBatchSaved = (batchId) => entries.some((entry) => entry.batchId === batchId)

  return (
    <CalendarContext.Provider
      value={{ entries, addEntry, addEntries, removeEntry, upsertEntries, isBatchSaved }}
    >
      {children}
    </CalendarContext.Provider>
  )
}
