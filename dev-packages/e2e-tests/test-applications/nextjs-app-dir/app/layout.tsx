import Link from 'next/link';
import { SpanContextProvider } from '../components/span-context';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div style={{ border: '1px solid lightgrey', padding: '12px' }}>
          <h1>Layout (/)</h1>
          <ul>
            <li>
              <Link href="/">/</Link>
            </li>
            <li>
              <Link href="/client-component">/client-component</Link>
            </li>
            <li>
              <Link href="/client-component/parameter/42">/client-component/parameter/42</Link>
            </li>
            <li>
              <Link href="/client-component/parameter/foo/bar/baz">/client-component/parameter/foo/bar/baz</Link>
            </li>
            <li>
              <Link href="/server-component">/server-component</Link>
            </li>
            <li>
              <Link href="/server-component/parameter/42">/server-component/parameter/42</Link>
            </li>
            <li>
              <Link href="/server-component/parameter/foo/bar/baz" prefetch={false}>
                /server-component/parameter/foo/bar/baz
              </Link>
            </li>
            <li>
              <Link href="/not-found">/not-found</Link>
            </li>
            <li>
              <Link href="/redirect">/redirect</Link>
            </li>
          </ul>
          <SpanContextProvider>{children}</SpanContextProvider>
        </div>
      </body>
    </html>
  );
}
