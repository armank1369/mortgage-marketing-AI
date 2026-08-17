/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Pixel-sampled from hellolucent.com's own screenshot (Joseph Kim's real brand site),
      // not guessed — this is the site's one CTA/accent color.
      colors: {
        'lucent-red': '#d42021',
        'lucent-red-dark': '#b31a1b',
        // Classic iMessage "sent" bubble blue — deliberately distinct from the lucent-red
        // accent, kept for the user chat bubble specifically since red reads as an alert/error
        // color there rather than a friendly sent-message color.
        'imessage-blue': '#0B93F6',
      },
    },
  },
  plugins: [],
}

