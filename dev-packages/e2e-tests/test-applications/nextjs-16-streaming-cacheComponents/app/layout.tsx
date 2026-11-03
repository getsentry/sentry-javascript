export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 760, margin: '0 auto', padding: '0 16px' }}>
        <header style={{ borderBottom: '1px solid #ddd', padding: '10px 0', marginBottom: 16 }}>
          <a href="/">← Cache scenarios</a>
        </header>
        {children}
      </body>
    </html>
  );
}
