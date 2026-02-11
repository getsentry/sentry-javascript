import { getDefaultIsolationScope } from '@sentry/core';
import * as Sentry from '@sentry/nextjs';

export default function Page() {
  Sentry.setTag('my-isolated-tag', true);
  Sentry.setTag('my-global-scope-isolated-tag', getDefaultIsolationScope().getScopeData().tags['my-isolated-tag']); // We set this tag to be able to assert that the previously set tag has not leaked into the global isolation scope

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
