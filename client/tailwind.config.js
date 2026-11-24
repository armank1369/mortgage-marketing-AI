/** @type {import('tailwindcss').Config} */
import colors from 'tailwindcss/colors'
import darkTheme from './tailwind.darkTheme.js'

// Lucie's palette. Both anchors are pixel-sampled from hellolucent.com, Joseph's own brand
// site: the dark navy used across its large sections (#181E28) and the teal-blue on its
// "Email Joseph Directly" button (#17788C). Every other step is a tint or shade of those two,
// so the whole app stays on-brand from this one file.
const lucentTeal = {
  50: '#EEF8FA',
  100: '#D5EEF2',
  200: '#ACDCE5',
  300: '#79C3D1',
  400: '#3FA3B7',
  500: '#1E8CA2',
  600: '#17788C', // hellolucent.com button teal
  700: '#126070',
  800: '#0F4D5A',
  900: '#0C3E49',
  950: '#072830',
}

const lucentNavy = '#181E28' // hellolucent.com section navy

export default {
  // Neon Auth's theme provider puts a `dark` class on <html>; see tailwind.darkTheme.js.
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Height-based breakpoints: laptops, and browser windows with a toolbar and bookmarks bar,
      // leave only 650-900px, so fixed-height chrome (sidebar header, footers) tightens there.
      screens: { short: { raw: '(max-height: 900px)' }, shorter: { raw: '(max-height: 700px)' } },
      colors: {
        // The app was built with Tailwind's stock blue/sky/indigo for links, highlights, active
        // states and focus rings. Pointing them at Lucent's teal recolors all of them at once,
        // without touching each page.
        blue: lucentTeal,
        sky: lucentTeal,
        indigo: lucentTeal,
        // Darkest neutrals become Lucent's navy, so dark cards, the mobile bar and headings
        // share the brand color instead of Tailwind's stock slate.
        slate: { ...colors.slate, 900: lucentNavy, 950: '#10141B' },
        lucent: { teal: lucentTeal, navy: lucentNavy },
        // Primary buttons and active states. lucent-navy-light is the hover shade (a dark button
        // reads better lightening on hover than darkening further toward black).
        'lucent-navy': lucentNavy,
        'lucent-navy-light': '#3B4048',
        // Accent for the single most important action on a screen (New Chat, focus rings).
        'lucent-accent': lucentTeal[600],
        // Classic iMessage "sent" bubble blue, deliberately distinct from the teal accent so the
        // user's own bubble still reads as its own conversational element.
        'imessage-blue': '#0B93F6',
        // Hello Lucent's CTA red and cream section background (same pixel-sampled source as
        // lucent-navy). Used on the sign-in screens to match the client's site.
        'lucent-red': '#d42021',
        'lucent-cream': '#f3f2ec',
      },
      fontFamily: {
        // Playfair Display is already loaded in index.html for the social-image templates;
        // reused for headings to echo Hello Lucent's serif headline style.
        serif: ["'Playfair Display'", 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Montserrat', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [darkTheme],
}
