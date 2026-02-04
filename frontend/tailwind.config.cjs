/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{vue,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        terminal: {
          green: '#00ff41',
          amber: '#ffb000'
        }
      },
      fontFamily: {
        mono: ['"Fira Code"', '"Courier New"', 'monospace']
      }
    }
  },
  plugins: []
}
