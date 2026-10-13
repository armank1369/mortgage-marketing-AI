// Scoped requests also reject late responses from transports that ignore abort.
export async function brandProfileRequest(api, scope, signal, businessName) {
  if (!scope || signal.aborted) throw Object.assign(new Error('Request canceled'), { code: 'ERR_CANCELED' })
  const [userId, workspaceId] = JSON.parse(scope)
  if (!userId || !workspaceId) throw Object.assign(new Error('Select a workspace'), { code: 'ERR_CANCELED' })
  const saving = businessName !== undefined
  const response = await api.send({
    url: '/api/brand-profile', method: saving ? 'PUT' : 'GET', signal,
    ...(saving ? { data: { business_name: businessName.trim() } } : {}),
  }, { expectedScope: scope })
  if (signal.aborted || api.getWorkspace(userId) !== workspaceId) {
    throw Object.assign(new Error('Request canceled'), { code: 'ERR_CANCELED' })
  }
  return response.data
}

export function brandProfileError(error) {
  if (error?.response?.data?.error === 'not_found') {
    return 'No brand profile exists for this workspace. Contact your workspace administrator.'
  }
  if (error?.response?.data?.error === 'validation_error') {
    return 'Enter a business name containing 1–100 characters.'
  }
  return null
}
