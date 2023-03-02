export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div style={{ backgroundColor: 'lightblue', padding: '12px' }}>
          <h1>Root layout</h1>
          {children}
        </div>
      </body>
    </html>
  );
}
