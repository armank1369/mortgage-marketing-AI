import axios from 'axios'
import { authClient } from './neon/neon.js'
import { createAuthenticatedApi } from './authenticatedApi.js'

const listeners = new Set()
const storage = {
  getItem: (key) => globalThis.sessionStorage?.getItem(key),
  setItem: (key, value) => globalThis.sessionStorage?.setItem(key, value),
  removeItem: (key) => globalThis.sessionStorage?.removeItem(key),
}
export const workspaceApi = createAuthenticatedApi({
  getSession: () => authClient.getSession(),
  request: (config) => axios.request(config),
  storage,
  onAccessError: (error, userId) => listeners.forEach((listener) => listener(error, userId)),
})
export function onWorkspaceAccessError(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
export const authenticatedPost = (url, data, config = {}) =>
  workspaceApi.send({ ...config, method: 'POST', url, data })
export const getBackendIdentity = () =>
  workspaceApi.send({ method: 'GET', url: '/api/auth/me' }, { workspace: false })
export const getWorkspaces = (signal) =>
  workspaceApi.send({ method: 'GET', url: '/api/workspaces', signal }, { workspace: false })
export { apiErrorMessage } from './authenticatedApi.js'
