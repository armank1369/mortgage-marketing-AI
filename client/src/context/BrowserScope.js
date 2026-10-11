import { createContext, useContext } from 'react'
export const BrowserScopeContext = createContext(null)
export function useBrowserScope() {
  const scope = useContext(BrowserScopeContext)
  if (!scope) throw new Error('Browser storage requires an authenticated workspace scope')
  return scope
}
