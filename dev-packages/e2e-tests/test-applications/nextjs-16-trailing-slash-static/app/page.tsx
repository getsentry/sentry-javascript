import Link from 'next/link';

export default function Page() {
  return (
    <div>
      <h1>Next 16 trailing slash test app</h1>
      <ul>
        <li>
          <Link href="/static-page">Static Page</Link>
        </li>
        <li>
          <Link href="/parameterized/foo">Parameterized</Link>
        </li>
        <li>
          <Link href="/parameterized/static">Parameterized Static</Link>
        </li>
      </ul>
    </div>
  );
}
