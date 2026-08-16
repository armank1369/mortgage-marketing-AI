import { createContext, useContext, useEffect, useState } from 'react'
import { loadCalendarEntriesFromStorage, saveCalendarEntriesToStorage } from '../utils/storage'

const CalendarContext = createContext(null)

// Seed data shown the first time a user opens the calendar, before they've saved anything
// of their own. Once real entries exist in storage, this is never used again.
function defaultEntries() {
  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth()
  return [
    { id: 1, topic: 'Educational reel for first-time buyers', platform: 'Instagram', date: new Date(year, month, 3), status: 'Scheduled' },
    { id: 2, topic: 'Self-employed success story', platform: 'LinkedIn', date: new Date(year, month, 10), status: 'Completed' },
    { id: 3, topic: 'Home buying tips carousel', platform: 'Instagram', date: new Date(year, month, 17), status: 'Upcoming' },
    { id: 4, topic: 'Lead magnet post', platform: 'Facebook', date: new Date(year, month, 24), status: 'Upcoming' },
  ]
}

// eslint-disable-next-line react/only-export-components
export function useCalendar() {
  const context = useContext(CalendarContext)
  if (!context) {
    throw new Error('useCalendar must be used within a CalendarProvider')
  }
  return context
}

export function CalendarProvider({ children }) {
  const [entries, setEntries] = useState(() => loadCalendarEntriesFromStorage() ?? defaultEntries())

  useEffect(() => {
    saveCalendarEntriesToStorage(entries)
  }, [entries])

  const addEntry = (entry) => {
    setEntries((prev) => [...prev, { id: Date.now() + Math.random(), status: 'Scheduled', ...entry }])
  }

  const addEntries = (newEntries) => {
    if (!newEntries || newEntries.length === 0) return
    setEntries((prev) => [
      ...prev,
      ...newEntries.map((entry, i) => ({ id: Date.now() + Math.random() + i, status: 'Scheduled', ...entry })),
    ])
  }

  const removeEntry = (id) => {
    setEntries((prev) => prev.filter((entry) => entry.id !== id))
  }

  return (
    <CalendarContext.Provider value={{ entries, setEntries, addEntry, addEntries, removeEntry }}>
      {children}
    </CalendarContext.Provider>
  )
}
