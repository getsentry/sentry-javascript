import Link from 'next/link';

const WithInitialPropsPage = ({ data }: { data: string }) => (
  <>
    <h1>WithInitialPropsPage {data}</h1>
    {/* @ts-ignore https://nextjs.org/docs/api-reference/next/link#if-the-child-is-a-custom-component-that-wraps-an-a-tag */}
    <Link href="/1337/withServerSideProps" passHref legacyBehavior>
      <a id="server-side-props-page">Go to withServerSideProps</a>
    </Link>
  </>
);

WithInitialPropsPage.getInitialProps = () => {
  return { data: '[some getInitialProps data]' };
};

export default WithInitialPropsPage;
