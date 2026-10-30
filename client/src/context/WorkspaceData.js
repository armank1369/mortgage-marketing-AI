import { createContext, useContext } from 'react'
export const WorkspaceDataContext = createContext(null)
export function useWorkspaceData() {
  const data = useContext(WorkspaceDataContext)
  if (!data) throw new Error('Workspace configuration provider required')
  return data
}
