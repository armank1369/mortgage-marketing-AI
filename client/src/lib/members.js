// Pure helpers for the Users tab. The server enforces every rule; these only shape what is shown.
export const ROLE_INFO = {
  owner: ['Owner', 'Full control, including who else is an owner or admin.'],
  admin: ['Admin', 'Runs the account: settings, Insights and everyday people.'],
  developer: ['Developer', 'Everyday use. Can change settings in test workspaces only.'],
  member: ['Member', 'Writes content and uses Chat and Calendar.'],
  viewer: ['Viewer', 'Can read chats and the calendar but not create anything.'],
}

export const MANAGER_ROLES = ['owner', 'admin']
export const canSeeUsers = (role) => MANAGER_ROLES.includes(role)
export const roleLabel = (role) => ROLE_INFO[role]?.[0] || role
export const roleHint = (role) => ROLE_INFO[role]?.[1] || ''

export const displayName = (person) => person.name || person.email || 'Unnamed account'

export function roleChangeSummary(person, newRole) {
  const who = displayName(person)
  const demotion = person.role === 'owner' || person.role === 'admin'
  return {
    title: `Change ${who} to ${roleLabel(newRole)}?`,
    body: `${who} is currently ${roleLabel(person.role)}. ${roleHint(newRole)}` +
      (demotion && newRole !== person.role ? ' They may lose access to some pages right away.' : ''),
    confirm: `Make ${roleLabel(newRole)}`,
  }
}

export const grantSummary = (person, newRole) => ({
  title: `Give ${displayName(person)} access as ${roleLabel(newRole)}?`,
  body: `${roleHint(newRole)} They will see the workspace the next time they open Lucie.`,
  confirm: `Give ${roleLabel(newRole)} access`,
})

export function filterPeople(people, query) {
  const q = (query || '').trim().toLowerCase()
  if (!q) return people
  return people.filter((p) => `${p.name || ''} ${p.email || ''}`.toLowerCase().includes(q))
}

const ERROR_TEXT = {
  permission_denied: 'Your role cannot make that change. Owners can change any role; admins can change members and viewers.',
  not_found: 'That person could not be found. Refresh the list and try again.',
}
// Conflicts carry a plain-language server message (last owner, stale role), so they return null here.
export const usersErrorMessage = (code, fallback) => (code === 'conflict' ? null : ERROR_TEXT[code] ?? fallback)
