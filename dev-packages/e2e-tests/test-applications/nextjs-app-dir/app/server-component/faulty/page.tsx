import { getDefaultIsolationScope } from '@sentry/core';
import * as Sentry from '@sentry/nextjs';

export const dynamic = 'force-dynamic';

export default async function FaultyServerComponent() {
  Sentry.setTag('my-isolated-tag', true);
  Sentry.setTag('my-global-scope-isolated-tag', getDefaultIsolationScope().getScopeData().tags['my-isolated-tag']); // We set this tag to be able to assert that the previously set tag has not leaked into the global isolation scope

  if (Math.random() + 1 > 0) {
    throw new Error('I am a faulty server component');
  }

  return null;
}
