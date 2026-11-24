// Neon Auth's sign-in form finishes with `navigate(redirectTo)` right after refetching the session.
// On iPhone Safari the session lives behind a cross-site cookie, and that in-page refetch can still
// come back empty, so the SPA route change landed on "/", saw no session, and bounced straight back
// to a blank sign-in form (a refresh then showed the user signed in). Leaving the auth screens with
// a full page load makes the browser fetch the session fresh, which is what the refresh did.

export function isAuthPath(to) {
  const path = String(to ?? '').split(/[?#]/)[0]
  return path === '/auth' || path.startsWith('/auth/')
}

export function createAuthNavigate(routerNavigate, hardNavigate) {
  return (to, ...rest) => {
    if (typeof to === 'string' && !isAuthPath(to)) {
      hardNavigate(to)
      return
    }
    routerNavigate(to, ...rest)
  }
}
