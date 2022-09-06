import Link from 'next/link';

const WithServerSidePropsPage = ({ data }: { data: string }) => (
  <>
    <h1>WithServerSidePropsPage {data}</h1>
    <Link href="/3c2e87573d/withInitialProps">
      <a id="initial-props-page">Go to withInitialProps</a>
    </Link>
  </>
);

export async function getServerSideProps() {
  return { props: { data: '[some getServerSideProps data]' } };
}

export default WithServerSidePropsPage;
