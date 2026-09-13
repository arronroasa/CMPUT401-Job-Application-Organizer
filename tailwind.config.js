/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
    './lib/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Theme tokens (light OnFile / dark Lodestar via CSS vars)
        paper: 'var(--paper)',
        surface: 'var(--surface)',
        ink: 'var(--ink)',
        inkSoft: 'var(--ink-soft)',
        inkFaint: 'var(--ink-faint)',
        line: 'var(--line)',
        panel: 'var(--panel)',

        pine: 'var(--pine)',
        pineDark: 'var(--pine-dark)',
        pineSoft: 'var(--pine-soft)',

        mint: 'var(--mint)',
        honey: 'var(--honey)',
        blush: 'var(--blush)',
        sage: 'var(--sage)',
        logo: 'var(--logo)',
        spark: 'var(--spark)',
        accent: 'var(--accent)',

        stageApplied: 'var(--stage-applied)',
        stageAppliedSoft: 'var(--stage-applied-soft)',
        stageScreening: 'var(--stage-screening)',
        stageScreeningSoft: 'var(--stage-screening-soft)',
        stageInterview: 'var(--stage-interview)',
        stageInterviewSoft: 'var(--stage-interview-soft)',
        stageOffer: 'var(--stage-offer)',
        stageOfferSoft: 'var(--stage-offer-soft)',
        stageClosed: 'var(--stage-closed)',
        stageClosedSoft: 'var(--stage-closed-soft)',
      },
      fontFamily: {
        display: ['var(--font-quicksand)', 'ui-rounded', 'system-ui', 'sans-serif'],
        sans: ['var(--font-work-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['var(--font-quicksand)', 'Georgia', 'serif'],
      },
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '20px',
        '2xl': '24px',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        lift: 'var(--shadow-lift)',
        glow: 'var(--shadow-glow)',
      },
      keyframes: {
        lsFloat: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        lsOrbit: {
          '0%, 100%': { transform: 'translate3d(0,0,0)' },
          '50%': { transform: 'translate3d(6px,-14px,0)' },
        },
        lsGlow: {
          '0%, 100%': { opacity: '.45' },
          '50%': { opacity: '.9' },
        },
        lsInUp: {
          from: { opacity: '0', transform: 'translateY(18px)' },
          to: { opacity: '1', transform: 'none' },
        },
      },
      animation: {
        lsFloat: 'lsFloat 7s ease-in-out infinite',
        lsOrbit: 'lsOrbit 5.8s ease-in-out infinite',
        lsGlow: 'lsGlow 4.5s ease-in-out infinite',
        lsInUp: 'lsInUp .42s cubic-bezier(.22,.8,.2,1) both',
      },
    },
  },
  plugins: [],
};
