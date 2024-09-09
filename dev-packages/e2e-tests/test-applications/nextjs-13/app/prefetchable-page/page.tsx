export const dynamic = 'force-dynamic';

export default async function Page() {
  await new Promise(resolve => setTimeout(resolve, 100));
  await (await fetch('http://example.com/', { cache: 'no-cache' })).text();
  return <p>hello</p>;
}

export async function generateMetadata() {
  const res = (await fetch('http://example.com/')).text();

  return {
    title: res,
  };
}
