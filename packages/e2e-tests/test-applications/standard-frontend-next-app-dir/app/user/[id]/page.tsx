export default async function Home() {
  const dynamid = await (await fetch('http://example.com', { cache: 'no-store' })).text(); // do a fetch request so that this server component is always rendered when requested
  return <p>I am a blank page :) {dynamid}</p>;
}
