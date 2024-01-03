export default function Page() {
  throw new Error('Pages SSR Error FC');
  return <div>Hello world!</div>;
}

export function getServerSideProps() {
  return {
    props: {
      foo: 'bar',
    },
  };
}
