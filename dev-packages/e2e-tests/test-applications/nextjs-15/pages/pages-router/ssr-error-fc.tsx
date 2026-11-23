import * as Sentry from '@sentry/nextjs';

export default function Page() {
  Sentry.setTag('my-isolated-tag', true);

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
