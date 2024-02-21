import http from 'http';

export const dynamic = 'force-dynamic';

export default async function Page() {
  await fetch('http://example.com/', { cache: 'no-cache' });
  await new Promise<void>(resolve => {
    http.get('http://example.com/', () => {
      resolve();
    });
  });
  return <p>Hello World!</p>;
}
