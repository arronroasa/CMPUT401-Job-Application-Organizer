import { Fraunces, IBM_Plex_Sans } from 'next/font/google';
import './globals.css';
import Providers from '@/components/Providers';

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-fraunces',
});

const plex = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex',
});

export const metadata = {
  title: 'TrackWise — Job Application Organizer',
  description: 'Track applications, tailor resumes, and stay on top of your job search.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${plex.variable}`}>
      <body className="font-sans text-ink bg-paper antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
