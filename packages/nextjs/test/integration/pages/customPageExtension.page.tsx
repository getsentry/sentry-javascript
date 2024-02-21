const BasicPage = (): JSX.Element => (
  <h1>
    This page simply exists to test the compatibility of Next.js' `pageExtensions` option with our auto wrapping
    process. This file should be turned into a page by Next.js and our webpack loader should process it.
  </h1>
);

export async function getServerSideProps() {
  return { props: { data: '[some getServerSideProps data]' } };
}

export default BasicPage;
