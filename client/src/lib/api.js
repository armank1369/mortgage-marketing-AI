import axios from 'axios'
import { authClient } from './neon/neon.js'

export async function getBackendIdentity() {
  const { data: tokenData, error } = await authClient.token()

  if (error || !tokenData?.token) {
    const authError = new Error('No Neon Auth JWT is available for the current session')
    authError.code = 'NO_AUTH_TOKEN'
    throw authError
  }

  return axios.get('/api/auth/me', {
    headers: {
      Authorization: `Bearer ${tokenData.token}`,
    },
  })
}
