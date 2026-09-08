/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  safelist: [
    // Safelist grid column classes for dynamic sections
    'grid-cols-2',
    'grid-cols-3',
    'grid-cols-4',
    'grid-cols-6',
    'grid-cols-8',
    'md:grid-cols-2',
    'md:grid-cols-3',
    'md:grid-cols-4',
    'md:grid-cols-6',
    'md:grid-cols-8',
    'lg:grid-cols-2',
    'lg:grid-cols-3',
    'lg:grid-cols-4',
    'lg:grid-cols-6',
    'lg:grid-cols-8',
  ],
  theme: {
    extend: {
      colors: {
        // Exnshop brand — royal blue + orange/gold from logo
        primary: {
          DEFAULT: '#0056FF',
          dark: '#003ECC',
          light: '#3377FF',
        },
        accent: {
          DEFAULT: '#FF8C00',
          light: '#FFB020',
          yellow: '#FFD700',
        },
        cream: '#EEF3FF',
        // Remap legacy green brand utilities to Exnshop blue
        green: {
          50: '#EEF3FF',
          100: '#D6E4FF',
          200: '#ADC8FF',
          300: '#84A9FF',
          400: '#5B8AFF',
          500: '#3377FF',
          600: '#0056FF',
          700: '#003ECC',
          800: '#002E99',
          900: '#001F66',
        },
      },
    },
  },
  plugins: [],
}
