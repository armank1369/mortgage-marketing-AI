/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Pixel-sampled from hellolucent.com's own screenshot (Joseph Kim's real brand site),
      // not guessed — red is the site's one CTA/accent color, navy/cream are its two section
      // background tones (each also doubling as the other's text color).
      colors: {
        'lucent-red': '#d42021',
        'lucent-red-dark': '#b31a1b',
        'lucent-navy': '#181e28',
        'lucent-cream': '#f3f2ec',
      },
      fontFamily: {
        // Already loaded via index.html for the generated social graphics (FONT_SERIF) —
        // reused here for the app's own wordmark to match Hello Lucent's serif headline style.
        serif: ["'Playfair Display'", 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
}

