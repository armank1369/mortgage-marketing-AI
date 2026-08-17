/** @type {import('tailwindcss').Config} */
export default {
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
      },
    },
  },
  plugins: [],
}

