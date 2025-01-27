import https from 'https';

export const dynamic = 'force-dynamic';

export default async function Page() {
  await fetch('https://github.com/', { cache: 'no-cache' }).then(res => res.text());
  await new Promise<void>(resolve => {
    https.get('https://github.com/', res => {
      res.on('data', () => {
        // Noop consuming some data so that request can close :)
      });

      res.on('close', resolve);
    });
  });
  return <p>Hello World!</p>;
}
