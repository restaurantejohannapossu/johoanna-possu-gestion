/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}', './lib/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        vino: Object.fromEntries([50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((k) => [k, `rgb(var(--vino-${k}) / <alpha-value>)`])),
        dorado: Object.fromEntries([50, 100, 200, 300, 400, 500, 600, 700].map((k) => [k, `rgb(var(--dorado-${k}) / <alpha-value>)`])),
        crema: Object.fromEntries([50, 100, 200, 300].map((k) => [k, `rgb(var(--crema-${k}) / <alpha-value>)`])),
        cafe: Object.fromEntries([300, 400, 500, 600, 700, 800, 900].map((k) => [k, `rgb(var(--cafe-${k}) / <alpha-value>)`])),
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
