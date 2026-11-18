import { useBrowserScope } from './BrowserScope'
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
  const scope = useBrowserScope()
  const [preferences, setPreferences] = useState(() => loadPreferencesFromStorage(scope))

  useEffect(() => {
    if (preferences) {
      savePreferencesToStorage(preferences, scope)
    }
  }, [preferences, scope])

  return (
    <PreferencesContext.Provider value={{ preferences, setPreferences }}>
      {children}
    </PreferencesContext.Provider>
  )
}
