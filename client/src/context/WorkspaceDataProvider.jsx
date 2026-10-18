import { useEffect, useState } from 'react'
import { useBrowserScope } from './BrowserScope.js'
import { WorkspaceDataContext } from './WorkspaceData.js'
import { workspaceApi, apiErrorMessage } from '../lib/api.js'
import { scopedRequest } from '../lib/workspaceConfiguration.js'

export default function WorkspaceDataProvider({ children }) {
  const scope = useBrowserScope()
  const [brand, setBrand] = useState(null)
  const [personas, setPersonas] = useState([])
  const [canWrite, setCanWrite] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    Promise.all([
      scopedRequest(workspaceApi, scope, controller.signal, '/api/brand-profile'),
      scopedRequest(workspaceApi, scope, controller.signal, '/api/personas'),
    ]).then(([profile, list]) => {
      if (controller.signal.aborted) return
      setBrand(profile)
      setPersonas(list.personas)
      setCanWrite(profile.can_write && list.can_write)
    }).catch((err) => {
      if (!controller.signal.aborted && err.code !== 'ERR_CANCELED') {
        setError(apiErrorMessage(err, 'Could not load workspace configuration. Please try again.'))
        setCanWrite(false)
      }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [scope, revision])
  return <WorkspaceDataContext.Provider value={{ brand, setBrand, personas, setPersonas, canWrite, loading, error,
    reload: () => setRevision((value) => value + 1) }}>{children}</WorkspaceDataContext.Provider>
}
