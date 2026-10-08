import axios from 'axios'
import { authClient } from './neon/neon.js'

export async function getBackendIdentity() {
  const { data, error } = await authClient.getSession()

  if (error || !data?.session?.token) {
    const authError = new Error('No active Neon Auth session/JWT is available')
    authError.code = 'NO_AUTH_TOKEN'
    throw authError
  }

  return axios.get('/api/auth/me', {
    headers: {
      Authorization: `Bearer ${data.session.token}`,
    },
  })
}