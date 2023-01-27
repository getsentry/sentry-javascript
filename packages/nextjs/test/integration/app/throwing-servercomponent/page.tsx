export default async function () {
  // do some request so that next will render this component serverside for each new pageload
  await fetch('http://example.com', { cache: 'no-store' });
  throw new Error('I am an Error thrown inside a server component');
  return <p>I am a server component!</p>;
}
