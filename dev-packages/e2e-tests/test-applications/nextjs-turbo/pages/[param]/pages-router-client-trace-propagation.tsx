export default function Page() {
  <p>Hello World!</p>;
}

// getServerSideProps makes this page dynamic and allows tracing data to be inserted
export async function getServerSideProps() {
  return {
    props: {},
  };
}
