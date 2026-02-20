/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Victorsdou brand palette — greens & warm creams
        // Swap only this block to white-label for other clients
        brand: {
          50:  '#f8f3ec', // warm cream (page background)
          100: '#ede6d9',
          200: '#e1dac9',
          300: '#cdc4b1',
          400: '#8ba57f', // soft sage green
          500: '#5c7552', // medium forest green
          600: '#4b6842', // primary button green
          700: '#31452a', // dark sidebar green
          800: '#263820',
          900: '#1a2b17',
        },
      },
      // UI Pro Max "Friendly SaaS" font recommendation for SaaS/B2B dashboards
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
