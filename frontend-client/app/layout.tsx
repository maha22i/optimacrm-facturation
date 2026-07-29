import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import { AuthProvider } from '@/lib/auth-context';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Espace Client — OptimaCRM',
  description: 'Portail client : factures, tickets, parc machines, contrats',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className={`${geistSans.variable} font-sans antialiased bg-gray-50 text-gray-900`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
