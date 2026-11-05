/** @type {import('tailwindcss').Config} */
const token = (name) => `hsl(var(--${name}) / <alpha-value>)`;
const pair = (name) => ({ DEFAULT: token(name), foreground: token(`${name}-foreground`) });

export default {
  content: ['./index.html', './src/renderer/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        border: token('border'),
        input: token('input'),
        ring: token('ring'),
        background: token('background'),
        foreground: token('foreground'),
        sidebar: token('sidebar'),
        chrome: token('chrome'),
        selection: token('selection'),
        success: token('success'),
        warning: token('warning'),
        info: token('info'),
        primary: pair('primary'),
        secondary: pair('secondary'),
        destructive: pair('destructive'),
        muted: pair('muted'),
        accent: pair('accent'),
        popover: pair('popover'),
        card: pair('card'),
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 1px)',
        sm: 'calc(var(--radius) - 2px)',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"SF Mono"', '"JetBrains Mono"', 'Menlo', 'Consolas', '"DejaVu Sans Mono"', 'monospace'],
      },
      fontSize: {
        '2xs': ['10px', '14px'],
        xxs: ['11px', '16px'],
        xs: ['12px', '16px'],
        sm: ['13px', '20px'],
        base: ['14px', '22px'],
        '2xl': ['24px', '30px'],
      },
      boxShadow: {
        overlay: '0 8px 24px -6px hsl(var(--shadow) / 0.28), 0 2px 6px -2px hsl(var(--shadow) / 0.18)',
      },
      keyframes: {
        'overlay-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'content-in': {
          from: { opacity: '0', transform: 'translate(-50%, -49%) scale(0.985)' },
          to: { opacity: '1', transform: 'translate(-50%, -50%) scale(1)' },
        },
        'menu-in': {
          from: { opacity: '0', transform: 'translateY(-2px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'toast-in': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: { '0%, 100%': { opacity: '0.55' }, '50%': { opacity: '1' } },
        progress: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(400%)' },
        },
      },
      animation: {
        'overlay-in': 'overlay-in 120ms ease-out',
        'content-in': 'content-in 140ms cubic-bezier(0.16, 1, 0.3, 1)',
        'menu-in': 'menu-in 100ms ease-out',
        'toast-in': 'toast-in 140ms cubic-bezier(0.16, 1, 0.3, 1)',
        shimmer: 'shimmer 1.4s ease-in-out infinite',
        progress: 'progress 1.1s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
