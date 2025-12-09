export default function WithServerSidePropsPage({ data }: { data: string }) {
  return <h1>WithServerSidePropsPage {data}</h1>;
}

export async function getServerSideProps() {
  return { props: { data: '[some getServerSideProps data]' } };
}
