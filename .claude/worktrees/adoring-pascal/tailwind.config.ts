import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        heebo: ['var(--font-heebo)', 'sans-serif'],
        assistant: ['var(--font-assistant)', 'sans-serif'],
        rubik: ['var(--font-rubik)', 'sans-serif'],
      },
      colors: {
        border: 'rgb(var(--border) / <alpha-value>)',
        input: 'rgb(var(--input) / <alpha-value>)',
        ring: 'rgb(var(--ring) / <alpha-value>)',
        background: 'rgb(var(--background) / <alpha-value>)',
        foreground: 'rgb(var(--foreground) / <alpha-value>)',
        primary: {
          DEFAULT: 'rgb(var(--primary) / <alpha-value>)',
          foreground: 'rgb(var(--primary-foreground) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'rgb(var(--secondary) / <alpha-value>)',
          foreground: 'rgb(var(--secondary-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'rgb(var(--destructive) / <alpha-value>)',
          foreground: 'rgb(var(--destructive-foreground) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'rgb(var(--muted) / <alpha-value>)',
          foreground: 'rgb(var(--muted-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          foreground: 'rgb(var(--accent-foreground) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'rgb(var(--popover) / <alpha-value>)',
          foreground: 'rgb(var(--popover-foreground) / <alpha-value>)',
        },
        card: {
          DEFAULT: 'rgb(var(--card) / <alpha-value>)',
          foreground: 'rgb(var(--card-foreground) / <alpha-value>)',
        },
        brand: {
          primary: 'rgb(var(--brand-primary) / <alpha-value>)',
          secondary: 'rgb(var(--brand-secondary) / <alpha-value>)',
          accent: 'rgb(var(--brand-accent) / <alpha-value>)',
          gold: 'rgb(var(--brand-gold) / <alpha-value>)',
          light: 'rgb(var(--brand-light) / <alpha-value>)',
          ivory: 'rgb(var(--brand-ivory) / <alpha-value>)',
          pearl: 'rgb(var(--brand-pearl) / <alpha-value>)',
          mist: 'rgb(var(--brand-mist) / <alpha-value>)',
          blush: 'rgb(var(--brand-blush) / <alpha-value>)',
          'gold-light': 'rgb(var(--brand-gold-light) / <alpha-value>)',
        },
        wizard: {
          bg: 'rgb(var(--wizard-bg) / <alpha-value>)',
          surface: 'rgb(var(--wizard-surface) / <alpha-value>)',
          'surface-alt': 'rgb(var(--wizard-surface-alt) / <alpha-value>)',
          border: 'rgb(var(--wizard-border) / <alpha-value>)',
          'text-primary': 'rgb(var(--wizard-text-primary) / <alpha-value>)',
          'text-secondary': 'rgb(var(--wizard-text-secondary) / <alpha-value>)',
          'text-tertiary': 'rgb(var(--wizard-text-tertiary) / <alpha-value>)',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        'sm': 'var(--shadow-sm)',
        'DEFAULT': 'var(--shadow)',
        'md': 'var(--shadow-md)',
        'lg': 'var(--shadow-lg)',
        'wizard-sm': 'var(--shadow-wizard-sm)',
        'wizard-md': 'var(--shadow-wizard-md)',
        'wizard-lg': 'var(--shadow-wizard-lg)',
        'wizard-xl': 'var(--shadow-wizard-xl)',
        'wizard-float': 'var(--shadow-wizard-float)',
        'accent-glow': 'var(--shadow-accent-glow)',
        'gold-glow': 'var(--shadow-gold-glow)',
        'nav-up': 'var(--shadow-nav-up)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        'spin-slow': {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
        'wizard-step-enter': {
          from: { opacity: '0', transform: 'translateY(16px) scale(0.99)', filter: 'blur(4px)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)', filter: 'blur(0)' },
        },
        'wizard-step-exit': {
          from: { opacity: '1', transform: 'translateY(0) scale(1)', filter: 'blur(0)' },
          to: { opacity: '0', transform: 'translateY(-8px) scale(0.99)', filter: 'blur(2px)' },
        },
        'shimmer': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        'step-complete': {
          '0%': { transform: 'scale(1)' },
          '30%': { transform: 'scale(1.15)' },
          '60%': { transform: 'scale(0.95)' },
          '100%': { transform: 'scale(1)' },
        },
        'chip-select': {
          '0%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(0.95)' },
          '100%': { transform: 'scale(1)' },
        },
        'ai-pulse-gradient': {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
        'spin-slow': 'spin-slow 3s linear infinite',
        'wizard-enter': 'wizard-step-enter 300ms cubic-bezier(0.22,1,0.36,1) forwards',
        'wizard-exit': 'wizard-step-exit 180ms ease-in forwards',
        'shimmer': 'shimmer 3s infinite',
        'step-complete': 'step-complete 400ms ease-out',
        'chip-select': 'chip-select 200ms ease-out',
        'ai-pulse': 'ai-pulse-gradient 3s ease infinite',
      },
    },
  },
  plugins: [],
}

export default config
