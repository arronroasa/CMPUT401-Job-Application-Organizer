import { Quicksand, Work_Sans, Inter } from 'next/font/google';
import './globals.css';
import ThemeRoot from '@/components/ThemeRoot';
import ScrollbarActivity from '@/components/ScrollbarActivity';
import { AppEntryTransitionProvider } from '@/components/AppEntryTransition';

const quicksand = Quicksand({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-quicksand',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-grotesk',
});

const workSans = Work_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-work-sans',
});

export const metadata = {
  title: 'OnFile — Job Application Organizer',
  description:
    'Every application, from listing to offer. Tailor your resume, track every reply, and prep for the interview — one place, one thread, no spreadsheet.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${quicksand.variable} ${workSans.variable} ${inter.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('onfile-theme');if(t!=='dark'&&t!=='light'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}if(t==='dark'){document.documentElement.classList.add('dark');document.documentElement.dataset.theme='dark'}else{document.documentElement.dataset.theme='light'}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="font-sans text-ink bg-paper antialiased">
        <ScrollbarActivity />
        <ThemeRoot>
          <AppEntryTransitionProvider>{children}</AppEntryTransitionProvider>
        </ThemeRoot>
      </body>
    </html>
  );
}
