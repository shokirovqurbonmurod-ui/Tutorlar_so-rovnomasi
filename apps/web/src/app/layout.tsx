import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: { default: 'TutorSurvey — Boshqaruv paneli', template: '%s · TutorSurvey' },
  description: "Xususiy maktab uchun tutorlar va o'qituvchilardan so'rovnoma va hisobotlar yig'ish tizimi",
  applicationName: 'TutorSurvey',
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8f9fc' },
    { media: '(prefers-color-scheme: dark)', color: '#111318' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz" suppressHydrationWarning>
      <body className="font-sans min-h-dvh antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
