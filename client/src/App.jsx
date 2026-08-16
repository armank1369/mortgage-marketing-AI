import { PreferencesProvider, usePreferences } from './context/PreferencesContext'
import { CalendarProvider } from './context/CalendarContext'
import PreferenceSetup from './pages/PreferenceSetup'
import ChatPage from './pages/ChatPage'

function AppContent() {
  const { preferences } = usePreferences()

  if (!preferences) {
    return <PreferenceSetup />
  }

  return <ChatPage />
}

export default function App() {
  return (
    <PreferencesProvider>
      <CalendarProvider>
        <AppContent />
      </CalendarProvider>
    </PreferencesProvider>
  )
}
