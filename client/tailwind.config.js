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
        // the teal-blue used on their "Email Joseph Directly" button, sampled consistently
        // across 20 points. Used for our own primary buttons/active states.
        'lucent-blue': '#17788c',
        'lucent-blue-dark': '#126070',
        // Classic iMessage "sent" bubble blue — deliberately distinct from lucent-blue, kept
        // for the user chat bubble specifically so it still reads as its own conversational
        // element rather than matching every button on the page.
        'imessage-blue': '#0B93F6',
      },
    },
  },
  plugins: [],
}

