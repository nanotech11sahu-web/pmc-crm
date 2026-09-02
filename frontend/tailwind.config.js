/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        hot: '#dc2626',
        medium: '#d97706',
        cold: '#2563eb',
      },
    },
  },
  plugins: [],
};
