import { getDefaultIsolationScope } from '@sentry/core';
import * as Sentry from '@sentry/nextjs';

export const config = {
  runtime: 'edge',
};

export default async function handler() {
  Sentry.setTag('my-isolated-tag', true);
  Sentry.setTag('my-global-scope-isolated-tag', getDefaultIsolationScope().getScopeData().tags['my-isolated-tag']); // We set this tag to be able to assert that the previously set tag has not leaked into the global isolation scope

  return new Response(
    JSON.stringify({
      name: 'Jim Halpert',
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
      },
    },
  );
}
