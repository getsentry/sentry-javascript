import type { Event } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';

it('captures errors the app throws while it answers tunnel requests, with their own request data', async ({
  signal,
}) => {
  let tunnelPath: string | undefined;
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const event = envelope[1]?.[0]?.[1] as Event;
      expect(event.exception?.values?.[0]?.value).toBe('The app failed to answer a tunnel request');
      // Without `AsyncLocalStorage`, the previous request's data would still be on the shared isolation scope.
      expect(event.request?.method).toBe('POST');
      expect(new URL(event.request!.url!).pathname).toBe(tunnelPath);
    })
    .start(signal);

  tunnelPath = await runner.makeRequest<string>('get', '/tunnel-path');
  await runner.makeRequest('post', tunnelPath!, { data: 'envelope', expectError: true });

  await runner.completed();
});
