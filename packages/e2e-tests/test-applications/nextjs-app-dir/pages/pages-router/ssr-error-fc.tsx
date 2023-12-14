export default function Page() {
  throw new Error('Pages SSR Error FC');
  // biome-ignore lint/correctness/noUnreachable: Intended change.
  return <div>Hello world!</div>;
}

export function getServerSideProps() {
  return {
    props: {
      foo: 'bar',
    },
  };
}
