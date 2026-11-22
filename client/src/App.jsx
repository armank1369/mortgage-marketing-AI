import { Routes, Route } from 'react-router-dom'
import {
  AuthLoading,
  RedirectToSignIn,
  SignedIn,
} from '@neondatabase/neon-js/auth/react'

import { PreferencesProvider } from './context/PreferencesContext'
import { CalendarProvider } from './context/CalendarContext'
import ChatPage from './pages/ChatPage'
import AuthPage from './pages/AuthPage'
import AuthDebugPage from './pages/AuthDebugPage'
import SettingsPage from './pages/SettingsPage'
import WorkspaceGate from './components/WorkspaceGate'
import WorkspaceDataProvider from './context/WorkspaceDataProvider.jsx'

function AppContent() {
  return <ChatPage />
}

function LucieApp() {
  return (
    <WorkspaceDataProvider><PreferencesProvider>
      <CalendarProvider>
        <AppContent />
      </CalendarProvider>
    </PreferencesProvider></WorkspaceDataProvider>
  )
}

function ProtectedLucie() {
  return (
    <>
      <AuthLoading>
        <div role="status" className="min-h-dvh flex flex-col items-center justify-center gap-3 bg-lucent-cream text-lucent-navy">
          <span aria-hidden="true" className="h-8 w-8 animate-spin rounded-full border-2 border-lucent-navy/20 border-t-lucent-navy" />
          <p className="text-sm">Checking your sign-in…</p>
        </div>
      </AuthLoading>

      <RedirectToSignIn />

      <SignedIn>
        <WorkspaceGate><LucieApp /></WorkspaceGate>
      </SignedIn>
    </>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/auth/:pathname" element={<AuthPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      {import.meta.env.DEV && (
        <Route path="/debug/auth" element={<AuthDebugPage />} />
      )}
      <Route path="/*" element={<ProtectedLucie />} />
    </Routes>
  )
}
