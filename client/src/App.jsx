import { Routes, Route } from 'react-router-dom'
import {
  AuthLoading,
  RedirectToSignIn,
  SignedIn,
} from '@neondatabase/neon-js/auth/react'

import { PreferencesProvider, usePreferences } from './context/PreferencesContext'
import { CalendarProvider } from './context/CalendarContext'
import PreferenceSetup from './pages/PreferenceSetup'
import ChatPage from './pages/ChatPage'
import AuthPage from './pages/AuthPage'

function AppContent() {
  const { preferences } = usePreferences()

  if (!preferences) {
    return <PreferenceSetup />
  }

  return <ChatPage />
}

function LucieApp() {
  return (
    <PreferencesProvider>
      <CalendarProvider>
        <AppContent />
      </CalendarProvider>
    </PreferencesProvider>
  )
}

function ProtectedLucie() {
  return (
    <>
      <AuthLoading>
        <div>Loading...</div>
      </AuthLoading>

      <RedirectToSignIn />

      <SignedIn>
        <LucieApp />
      </SignedIn>
    </>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/auth/:pathname" element={<AuthPage />} />
      <Route path="/*" element={<ProtectedLucie />} />
    </Routes>
  )
}