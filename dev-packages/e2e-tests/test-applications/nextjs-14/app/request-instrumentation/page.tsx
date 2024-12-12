import http from 'http';

export const dynamic = 'force-dynamic';

export default async function Page() {
  await fetch('http://example.com/', { cache: 'no-cache' }).then(res => res.text());
  await new Promise<void>(resolve => {
    http.get('http://example.com/', res => {
      res.on('data', () => {
        // Noop consuming some data so that request can close :)
      });

      res.on('close', resolve);
    });
  });
  return <p>Hello World!</p>;
}
