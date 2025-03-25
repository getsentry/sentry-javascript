import { getCurrentScope } from '@sentry/core';

/**
 * A function to diagnose why the SDK might not be successfully sending data.
 *
 * Possible return values wrapped in a Promise:
 * - `"no-client-active"` - There was no active client when the function was called. This possibly means that the SDK was not initialized yet.
 * - `"sentry-unreachable"` - The Sentry SaaS servers were not reachable. This likely means that there is an ad blocker active on the page or that there are other connection issues.
 *
 * If the function doesn't detect an issue it resolves to `undefined`.
 */
export async function diagnoseSdk(): Promise<'no-client-active' | 'sentry-unreachable' | void> {
  const client = getCurrentScope().getClient();

  if (!client) {
    return 'no-client-active';
  }

  try {
    // If fetch throws, there is likely an ad blocker active or there are other connective issues.
    await fetch(
      // We want this to be as close as possible to an actual ingest URL so that ad blockers will actually block the request
      'https://o1337.ingest.sentry.io/api/1337/envelope/?sentry_version=7&sentry_key=1337&sentry_client=sentry.javascript.react%2F1.33.7',
      {
        body: '',
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
      },
    );
  } catch {
    return 'sentry-unreachable';
  }
}
