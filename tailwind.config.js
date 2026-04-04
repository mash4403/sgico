/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        sgico: {
          bg: '#0a0e1a',
          card: '#111827',
          border: '#1f2937',
          accent: '#3b82f6',
        }
      }
    }
  },
  plugins: [],
}
