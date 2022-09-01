const WithServerSidePropsPage = ({ data }: { data: string }) => <h1>WithServerSidePropsPage {data}</h1>;

export async function getServerSideProps() {
  return { props: { data: '[some getServerSideProps data]' } };
}

export default WithServerSidePropsPage;
