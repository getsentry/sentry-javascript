export default function Page() {
  return <p>loading</p>;
}

export async function generateMetadata() {
  const res = (await fetch('http://example.com/')).text();

  return {
    title: res,
  };
}
