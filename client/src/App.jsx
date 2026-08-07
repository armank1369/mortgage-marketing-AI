import { PreferencesProvider, usePreferences } from './context/PreferencesContext'
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
      <AppContent />
    </PreferencesProvider>
  )
}
