/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Professional blue & white HR theme
        primary: {
          50: '#E8F5F5',
          100: '#C5E8E8',
          200: '#9DD8D8',
          300: '#70C4C4',
          400: '#4ECDC4',
          500: '#2BB8B0',
          600: '#1B6B6B',
          700: '#155858',
          800: '#0F4444',
          900: '#0A2E2E',
        },
      },
    },
  },
  plugins: [],
}
