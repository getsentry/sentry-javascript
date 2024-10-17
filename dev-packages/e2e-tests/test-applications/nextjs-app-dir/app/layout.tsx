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
              <Link href="/" prefetch={false}>
                /
              </Link>
            </li>
            <li>
              <Link href="/client-component" prefetch={false}>
                /client-component
              </Link>
            </li>
            <li>
              <Link href="/client-component/parameter/42" prefetch={false}>
                /client-component/parameter/42
              </Link>
            </li>
            <li>
              <Link href="/client-component/parameter/foo/bar/baz" prefetch={false}>
                /client-component/parameter/foo/bar/baz
              </Link>
            </li>
            <li>
              <Link href="/server-component" prefetch={false}>
                /server-component
              </Link>
            </li>
            <li>
              <Link href="/server-component/parameter/42" prefetch={false}>
                /server-component/parameter/42
              </Link>
            </li>
            <li>
              <Link href="/server-component/parameter/foo/bar/baz" prefetch={false}>
                /server-component/parameter/foo/bar/baz
              </Link>
            </li>
            <li>
              <Link href="/not-found" prefetch={false}>
                /not-found
              </Link>
            </li>
            <li>
              <Link href="/redirect" prefetch={false}>
                /redirect
              </Link>
            </li>
          </ul>
          <SpanContextProvider>{children}</SpanContextProvider>
        </div>
      </body>
    </html>
  );
}
