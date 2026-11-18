import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { useBrowserScope } from '../context/BrowserScope.js'
import { workspaceApi } from './api.js'
import { createChatPersistence } from './chatPersistence.js'

export function useChatPersistence() {
  const scope = useBrowserScope()
  const controller = useMemo(() => createChatPersistence({ api: workspaceApi, scope,
    storage: { getItem: (key) => globalThis.localStorage.getItem(key), setItem: (key, value) => globalThis.localStorage.setItem(key, value) } }), [scope])
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  useEffect(() => {
    controller.start()
    let lastRefresh = Date.now()
    const refresh = () => {
      if (document.visibilityState !== 'hidden' && navigator.onLine !== false) {
        lastRefresh = Date.now()
        controller.reconcile()
      }
    }
    const interval = setInterval(() => {
      if (Date.now() - lastRefresh >= 15000 || controller.operations().some((op) => !['succeeded', 'failed', 'abandoned'].includes(op.state))) refresh()
    }, 2000)
    window.addEventListener('focus', refresh)
    window.addEventListener('online', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      controller.stop(); clearInterval(interval)
      window.removeEventListener('focus', refresh); window.removeEventListener('online', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [controller])
  return [state, controller]
}
