import { getCurrentScope } from '@sentry/core';

/**
 * A function to diagnose why the SDK might not be successfully sending data.
 *
 * Possible return values wrapped in a Promise:
 * - `"no-client-active"` - There was no active client when the function was called. This possibly means that the SDK was not initialized yet.
 * - `"sentry-unreachable"` - There was no active client when the function was called. This possibly means that the SDK was not initialized yet.
 *
 * If the function doesn't detect an issue it resolves to `undefined`.
 */
export async function diagnoseSdk(): Promise<'no-client-active' | 'sentry-unreachable' | void> {
  const client = getCurrentScope().getClient();

  if (!client) {
    return 'no-client-active';
  }

  try {
    await fetch(
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
