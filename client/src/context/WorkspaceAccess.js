import { createContext, useContext } from 'react'
export const WorkspaceAccessContext = createContext({ role: 'viewer' })
export const useWorkspaceAccess = () => useContext(WorkspaceAccessContext)
