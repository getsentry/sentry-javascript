import Link from 'next/link';

const WithInitialPropsPage = ({ data }: { data: string }) => (
  <>
    <h1>WithInitialPropsPage {data}</h1>
    <Link href="/1337/withServerSideProps">
      <a id="server-side-props-page">Go to withServerSideProps</a>
    </Link>
  </>
);

WithInitialPropsPage.getInitialProps = () => {
  return { data: '[some getInitialProps data]' };
};

export default WithInitialPropsPage;
