import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        primary: {
          DEFAULT: '#25D366',
          dark: '#128C7E',
          light: '#34E879',
        },
        accent: {
          DEFAULT: '#075E54',
          light: '#0A8F7F',
        },
        surface: {
          DEFAULT: '#0D1117',
          light: '#161B22',
          lighter: '#21262D',
        },
      },
      fontFamily: {
        sans: ['var(--font-outfit)', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'fade-in-up': 'fadeInUp 0.6s ease-out',
        'slide-in-right': 'slideInRight 0.5s ease-out',
        'pulse-glow': 'pulseGlow 2s infinite',
        'float-slow': 'floatSlow 8s ease-in-out infinite',
        shine: 'shine 3.2s linear infinite',
        'typing-dot': 'typingDot 1.2s ease-in-out infinite',
        'progress-bar': 'progressBar var(--progress-duration, 6500ms) linear forwards',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(-20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(37, 211, 102, 0.3)' },
          '50%': { boxShadow: '0 0 40px rgba(37, 211, 102, 0.6)' },
        },
        floatSlow: {
          '0%, 100%': { transform: 'translate3d(0, 0, 0) rotate(-1deg)' },
          '50%': { transform: 'translate3d(0, -14px, 0) rotate(1deg)' },
        },
        shine: {
          '0%': { backgroundPosition: '0% 50%' },
          '100%': { backgroundPosition: '200% 50%' },
        },
        typingDot: {
          '0%, 80%, 100%': { opacity: '0.35', transform: 'translateY(0)' },
          '40%': { opacity: '1', transform: 'translateY(-2px)' },
        },
        progressBar: {
          '0%': { transform: 'scaleX(0)' },
          '100%': { transform: 'scaleX(1)' },
        },
      },
    },
  },
  plugins: [],
}
export default config

