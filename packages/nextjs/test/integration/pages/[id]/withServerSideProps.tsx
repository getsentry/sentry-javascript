import Link from 'next/link';

const WithServerSidePropsPage = ({ data }: { data: string }) => (
  <>
    <h1>WithServerSidePropsPage {data}</h1>
    {/* @ts-expect-error https://nextjs.org/docs/api-reference/next/link#if-the-child-is-a-custom-component-that-wraps-an-a-tag */}
    <Link href="/3c2e87573d/withInitialProps" passHref legacyBehavior>
      <a id="initial-props-page">Go to withInitialProps</a>
    </Link>
  </>
);

export async function getServerSideProps() {
  return { props: { data: '[some getServerSideProps data]' } };
}

export default WithServerSidePropsPage;
