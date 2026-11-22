// Plain-language copy for the sign-in screens. Neon Auth's defaults are generic
// ("Enter your email below to login to your account", "Login"), so these override them with
// wording a broker's team would expect. Kept free of JSX so it can be unit tested with node --test.
//
// Error strings deliberately stay generic about *which* part was wrong: saying "no account with
// that email" would let anyone probe which addresses are registered.

export const AUTH_LOCALIZATION = {
  SIGN_IN: 'Sign in',
  SIGN_IN_DESCRIPTION: 'Welcome back. Use your work email to pick up where you left off.',
  SIGN_IN_ACTION: 'Sign in',
  SIGN_UP: 'Create an account',
  SIGN_UP_DESCRIPTION: 'Use the work email your team lead will add to the Lucent workspace.',
  SIGN_UP_ACTION: 'Create account',
  FORGOT_PASSWORD: 'Reset your password',
  FORGOT_PASSWORD_DESCRIPTION: "Enter your work email and we'll send you a link to choose a new password.",
  FORGOT_PASSWORD_ACTION: 'Email me a reset link',
  FORGOT_PASSWORD_EMAIL: 'If that email has an account, a reset link is on its way. Check your inbox and spam folder.',
  FORGOT_PASSWORD_LINK: 'Forgot password?',
  RESET_PASSWORD_DESCRIPTION: 'Choose a new password for your Lucie account.',
  EMAIL_PLACEHOLDER: 'you@company.com',
  DONT_HAVE_AN_ACCOUNT: 'New to Lucie?',
  ALREADY_HAVE_AN_ACCOUNT: 'Already have an account?',
  EMAIL_REQUIRED: 'Enter your work email.',
  PASSWORD_REQUIRED: 'Enter your password.',
  REMEMBER_ME: 'Keep me signed in on this device',
  INVALID_EMAIL_OR_PASSWORD: "That email and password don't match. Check for typos or reset your password.",
  INVALID_EMAIL: 'Enter a valid email address, like you@company.com.',
  USER_NOT_FOUND: "That email and password don't match. Check for typos or reset your password.",
  PASSWORD_TOO_SHORT: 'That password is too short. Try a longer one.',
  USER_ALREADY_EXISTS: 'An account with this email already exists. Try signing in instead.',
  EMAIL_NOT_VERIFIED: 'Please confirm your email first. Look for the verification email from Lucie.',
  TOO_MANY_ATTEMPTS: 'Too many attempts. Wait a few minutes, then try again.',
  REQUEST_FAILED: "We couldn't reach the sign-in service. Check your connection and try again.",
}

// Per-screen context shown beside the form, keyed by the URL segment after /auth/.
const SCREENS = {
  'sign-in': {
    title: 'Sign in',
    note: 'Only members of the Lucent workspace can open Lucie. If you were just invited, create your account with the same email.',
  },
  'sign-up': {
    title: 'Create account',
    note: 'After you create your account, your workspace admin needs to add you before you can start chatting with Lucie.',
  },
  'forgot-password': {
    title: 'Reset password',
    note: "Reset links expire after a short time. If yours doesn't arrive in a few minutes, check spam or request another.",
  },
  'reset-password': {
    title: 'Choose a new password',
    note: "Pick something you don't use on other sites. You'll be signed in once it's saved.",
  },
}

const FALLBACK = { title: 'Sign in', note: SCREENS['sign-in'].note }

export function authScreen(pathname) {
  const key = typeof pathname === 'string' ? pathname.split('/').pop() : ''
  return Object.hasOwn(SCREENS, key) ? SCREENS[key] : FALLBACK
}

export function authDocumentTitle(pathname) {
  return `${authScreen(pathname).title} · Lucie`
}
