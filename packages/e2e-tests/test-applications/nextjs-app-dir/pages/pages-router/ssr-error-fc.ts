export default function Page() {
  throw new Error('Pages SSR Error FC');
}

export function getServerSideProps() {
  return {
    props: {
      foo: 'bar',
    },
  };
}
