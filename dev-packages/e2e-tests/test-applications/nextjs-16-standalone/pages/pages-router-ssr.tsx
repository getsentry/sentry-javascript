export default function Page() {
  return <p>Next.js 16 Standalone Output Test (Pages Router)</p>;
}

// Renders the page per request, so the document carries the trace of the request.
export async function getServerSideProps() {
  return {
    props: {},
  };
}
