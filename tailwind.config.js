/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
    './lib/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        // OnFile core palette
        paper: '#faf6ec',      // page background (warm cream)
        surface: '#fffdf7',    // cards / raised surfaces
        ink: '#14150f',        // primary text / dark buttons
        inkSoft: '#5d5f52',    // secondary text  (~ rgba(20,21,15,.72))
        inkFaint: '#8f9184',   // muted text      (~ rgba(20,21,15,.5))
        line: '#e6e2d4',       // hairline borders (~ rgba(20,21,15,.1))
        panel: '#f2f4ee',      // inset panels / chips

        // brand green (was "pine")
        pine: '#3f6b4a',
        pineDark: '#2f5137',
        pineSoft: '#cfe9d4',

        // landing accents
        mint: '#cfe9d4',
        honey: '#ffe08a',
        blush: '#f9d9e7',
        sage: '#eaf3ec',
        logo: '#3c3d2c',
        spark: '#c1902f',

        // pipeline stages (from the OnFile template)
        stageApplied: '#8d9186',
        stageAppliedSoft: '#eceee6',
        stageScreening: '#c99a3d',
        stageScreeningSoft: '#fdf1cf',
        stageInterview: '#4a6f9c',
        stageInterviewSoft: '#dde7f3',
        stageOffer: '#3f6b4a',
        stageOfferSoft: '#cfe9d4',
        stageClosed: '#9c5a4a',
        stageClosedSoft: '#f4ddd6',
      },
      fontFamily: {
        display: ['var(--font-quicksand)', 'ui-rounded', 'system-ui', 'sans-serif'],
        sans: ['var(--font-work-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // legacy alias so any pre-reskin markup keeps a sane face
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
        card: '0 18px 40px -26px rgba(20,21,15,.35)',
        lift: '0 30px 60px -40px rgba(20,21,15,.55)',
      },
    },
  },
  plugins: [],
};
