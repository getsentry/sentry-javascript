export const metadata = {
  title: 'Next.js Spotlight E2E Test',
  description: 'Tests NEXT_PUBLIC_SENTRY_SPOTLIGHT env var support',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
