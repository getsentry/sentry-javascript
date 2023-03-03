import { TransactionContextProvider } from '../components/transaction-context';
import Link from 'next/link';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div style={{ border: '1px solid lightgrey', padding: '12px' }}>
          <h1>Layout (/)</h1>
          <ul>
            <li>
              <Link href="/client-component/parameter/foo/bar/baz">/client-component/parameter/foo/bar/baz</Link>
            </li>
            <li>
              <Link href="/client-component/parameter/1/2">/client-component/parameter/1/2</Link>
            </li>
            <li>
              <Link href="/client-component/parameter/1/2">/client-component/parameter/1/2</Link>
            </li>
            <li>
              <Link href="/client-component/parameter/1/2">/client-component/parameter/1/2</Link>
            </li>
            <li>
              <Link href="/client-component/parameter/1/2">/client-component/parameter/1/2</Link>
            </li>
          </ul>
          <TransactionContextProvider>{children}</TransactionContextProvider>
        </div>
      </body>
    </html>
  );
}
