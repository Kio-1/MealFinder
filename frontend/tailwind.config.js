/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class', 
  theme: {
    extend: {
      colors: {
        brand: '#00ff88', 
        'brand-hover': '#00cc6a',
      },
      fontFamily: {
        sans: ['Outfit', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
}