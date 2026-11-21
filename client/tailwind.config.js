/** @type {import('tailwindcss').Config} */
import darkTheme from './tailwind.darkTheme.js'

export default {
  // Neon Auth's theme provider puts a `dark` class on <html>; see tailwind.darkTheme.js.
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Pixel-sampled from hellolucent.com's own screenshot (Joseph Kim's real brand site) —
        // the dark navy used across large sections of their site. Used for our own primary
        // buttons/active states; lucent-navy-light is a lightened hover shade (a dark button
        // reads better lightening on hover than darkening further toward black).
        'lucent-navy': '#181e28',
        'lucent-navy-light': '#3b4048',
        // Classic iMessage "sent" bubble blue — deliberately distinct from lucent-navy, kept
        // for the user chat bubble specifically so it still reads as its own conversational
        // element rather than matching every button on the page.
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
      },
    },
  },
  plugins: [darkTheme],
}

