import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#060D1A',
          900: '#0A1628',
          800: '#10233F',
          700: '#1A3355',
        },
        brand: {
          500: '#E8A317',
          400: '#F2B73C',
          600: '#C98712',
        },
        sea: {
          500: '#14B8A6',
          700: '#0F766E',
        },
        paper: '#F6F4EE',
      },
      fontFamily: {
        display: ['var(--font-display)', 'ui-sans-serif', 'system-ui'],
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui'],
      },
      boxShadow: {
        lift: '0 20px 50px -20px rgba(6,13,26,.45)',
      },
      borderRadius: {
        xl2: '1.25rem',
      },
    },
  },
  plugins: [],
};

export default config;
