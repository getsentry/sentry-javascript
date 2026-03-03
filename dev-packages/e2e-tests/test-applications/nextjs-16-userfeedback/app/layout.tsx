import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Feedback Test App',
  description: 'E2E test app for Sentry Feedback SDK',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
