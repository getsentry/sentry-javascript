export const metadata = {
  title: 'Next.js Spotlight Test',
  description: 'Testing Spotlight auto-enablement in development mode',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

