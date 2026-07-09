/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,html}'],
  theme: {
    extend: {
      colors: {
        'bd-bg-start': '#0c1222',
        'bd-bg-mid1':  '#1a1040',
        'bd-bg-mid2':  '#2d1b4e',
        'bd-bg-end':   '#1a2744',
      },
      backgroundImage: {
        'bd-gradient':
          'linear-gradient(135deg, #0c1222 0%, #1a1040 40%, #2d1b4e 70%, #1a2744 100%)',
      },
      boxShadow: {
        'card-hover': '0 12px 32px rgba(0,0,0,.35)',
        'modal':      '0 20px 60px rgba(0,0,0,.5)',
      },
      animation: {
        'spin-slow': 'spin 0.7s linear infinite',
      },
    },
  },
  plugins: [require('daisyui')],
  daisyui: {
    themes: [
      {
        'revivetab': {
          'primary':         '#4fc3f7',
          'primary-content': '#0c1222',
          'secondary':       '#ab47bc',
          'accent':          '#ff9800',
          'neutral':         '#1e1e2e',
          'base-100':        '#0c1222',
          'base-200':        '#15182b',
          'base-300':        '#1e2238',
          'base-content':    '#e8e8e8',
          'info':            '#26c6da',
          'success':         '#66bb6a',
          'warning':         '#ffa726',
          'error':           '#ef5350',
          '--rounded-box':   '0.75rem',
          '--rounded-btn':   '0.625rem',
          '--rounded-badge': '0.5rem',
          '--animation-btn': '0.15s',
          '--btn-text-case': 'none',
        },
      },
    ],
    darkTheme: 'revivetab',
    base: true,
    styled: true,
    utils: true,
    logs: false,
  },
};
