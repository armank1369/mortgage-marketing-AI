import { scopedRequest, validateBrandFields } from './workspaceConfiguration.js'
// Retain the Step H single-name call contract and support a validated field patch.
export async function brandProfileRequest(api, scope, signal, fields) {
  const saving = fields !== undefined
  const patch = saving ? validateBrandFields(typeof fields === 'string' ? { business_name: fields } : fields) : undefined
  return scopedRequest(api, scope, signal, '/api/brand-profile', saving ? 'PUT' : 'GET', patch)
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
