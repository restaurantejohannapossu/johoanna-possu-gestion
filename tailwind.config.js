/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}', './lib/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        vino: { 50: '#fbf2f3', 100: '#f5e1e4', 200: '#e8bcc3', 300: '#d48c98', 400: '#b85567', 500: '#9a3347', 600: '#7f2538', 700: '#6b1e2e', 800: '#561826', 900: '#40121c' },
        dorado: { 50: '#fdf8e9', 100: '#faedc4', 200: '#f4da88', 300: '#ecc24d', 400: '#e0a92a', 500: '#c98f17', 600: '#a87012', 700: '#7d5310' },
        crema: { 50: '#fffdf8', 100: '#fbf5e9', 200: '#f4e9d3', 300: '#e9d8b6' },
        cafe: { 300: '#a08876', 400: '#7d6352', 500: '#5f4838', 600: '#4a3729', 700: '#3e2a1f', 800: '#2e1f16', 900: '#1f150f' },
      },
      fontFamily: {
        titulo: ['Georgia', 'Cambria', '"Times New Roman"', 'serif'],
        sans: ['system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'Ubuntu', 'sans-serif'],
      },
      boxShadow: { suave: '0 1px 2px rgba(62,42,31,.06), 0 4px 16px rgba(62,42,31,.06)' },
    },
  },
  plugins: [],
};
