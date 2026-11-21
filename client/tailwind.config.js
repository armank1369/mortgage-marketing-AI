/** @type {import('tailwindcss').Config} */
import colors from 'tailwindcss/colors'

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
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
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
        lucent: { teal: lucentTeal, navy: lucentNavy, cream: '#F3F2EC' },
        // Primary buttons and active states. lucent-navy-light is the hover shade (a dark button
        // reads better lightening on hover than darkening further toward black).
        'lucent-navy': lucentNavy,
        'lucent-navy-light': '#3B4048',
        // Accent for the single most important action on a screen (New Chat, focus rings).
        'lucent-accent': lucentTeal[600],
        // Classic iMessage "sent" bubble blue, deliberately distinct from the teal accent so the
        // user's own bubble still reads as its own conversational element.
        'imessage-blue': '#0B93F6',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Montserrat', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
