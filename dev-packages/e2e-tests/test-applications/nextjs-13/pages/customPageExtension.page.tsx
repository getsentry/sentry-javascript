export default function BasicPage() {
  return (
    <h1>
      This page simply exists to test the compatibility of Next.js' `pageExtensions` option with our auto wrapping
      process. This file should be turned into a page by Next.js and our webpack loader should process it.
    </h1>
  );
}

export async function getServerSideProps() {
  throw new Error('custom page extension error');
}
