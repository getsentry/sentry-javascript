const WithServerSidePropsPage = ({ data }: { data: string }) => <h1>WithServerSidePropsPage {data}</h1>;

export async function getServerSideProps() {
  return { props: { data: '[some serverSidePropsData data]' } };
}

export default WithServerSidePropsPage;
