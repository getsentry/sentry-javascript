const WithServerSidePropsPage = ({ data }: { data: string }) => <h1>WithServerSidePropsPage {data}</h1>;

export async function getServerSideProps() {
  throw new Error('ServerSideProps Error');
}

export default WithServerSidePropsPage;
