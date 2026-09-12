import { Quicksand, Work_Sans } from 'next/font/google';
import './globals.css';

const quicksand = Quicksand({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-quicksand',
});

const workSans = Work_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-work-sans',
});

export const metadata = {
  title: 'OnFile — Job Application Organizer',
  description: 'Every application, from listing to offer. Tailor your resume, track every reply, and prep for the interview — one place, one thread, no spreadsheet.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${quicksand.variable} ${workSans.variable}`}>
      <body className="font-sans text-ink bg-paper antialiased">{children}</body>
    </html>
  );
}
