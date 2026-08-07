import { createContext, useContext, useEffect, useState } from 'react'
import { loadPreferencesFromStorage, savePreferencesToStorage } from '../utils/storage'

const PreferencesContext = createContext(null)

// eslint-disable-next-line react/only-export-components
export function usePreferences() {
  const context = useContext(PreferencesContext)
  if (!context) {
    throw new Error('usePreferences must be used within a PreferencesProvider')
  }
  return context
}

export function PreferencesProvider({ children }) {
  const [preferences, setPreferences] = useState(loadPreferencesFromStorage)

  useEffect(() => {
    if (preferences) {
      savePreferencesToStorage(preferences)
    }
  }, [preferences])

  return (
    <PreferencesContext.Provider value={{ preferences, setPreferences }}>
      {children}
    </PreferencesContext.Provider>
  )
}
