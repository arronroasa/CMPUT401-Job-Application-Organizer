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
        paper: '#F4F6F1',
        surface: '#FFFFFF',
        ink: '#1B2430',
        inkSoft: '#5B6472',
        inkFaint: '#8A93A0',
        line: '#E2E5DF',

        pine: '#3B5D50',
        pineDark: '#2C4740',
        pineSoft: '#E7EEE9',

        stageApplied: '#8C8F98',
        stageAppliedSoft: '#EFEFF1',
        stageScreening: '#C98A3B',
        stageScreeningSoft: '#FBF0E1',
        stageInterview: '#3B6FA0',
        stageInterviewSoft: '#E7EEF5',
        stageOffer: '#3B8F5C',
        stageOfferSoft: '#E6F2EA',
        stageClosed: '#9B5B5B',
        stageClosedSoft: '#F5E9E9',
      },
      fontFamily: {
        serif: ['var(--font-fraunces)', 'Georgia', 'serif'],
        sans: ['var(--font-plex)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        sm: '4px',
        md: '8px',
        lg: '14px',
      },
    },
  },
  plugins: [],
};
