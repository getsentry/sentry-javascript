export default function Page() {
  return <p>Hello World!</p>;
}

// getServerSideProps makes this page dynamic and allows tracing data to be inserted
export async function getServerSideProps() {
  return {
    props: {},
  };
}
