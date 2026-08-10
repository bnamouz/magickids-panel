import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Heebo', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          primary: '#01696F',
          dark: '#024B50',
          accent: '#DA7101',
          bg: '#F0F9FA',
        },
      },
    },
  },
  plugins: [],
};

export default config;
