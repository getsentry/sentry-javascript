export default function Page() {
  return <p>This page should never render</p>;
}

export async function getServerSideProps() {
  throw new Error('Pages Router getServerSideProps error with basePath');
}
