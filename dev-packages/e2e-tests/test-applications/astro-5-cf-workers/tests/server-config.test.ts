import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test.skip(!process.env.PUBLIC_E2E_TEST_SERVER_CONFIG, 'Only runs in the server-config variant');

// The Worker wrapper must not init a client from the (missing) bindings before `sentry.server.config`
// runs, or the isolate keeps that client and the user's options never apply. Several requests hit
// the same isolate to cover the cached client too.
test('initializes from sentry.server.config on every request to the isolate', async ({ request }) => {
  for (let i = 0; i < 4; i++) {
    const errorEventPromise = waitForError('astro-5-cf-workers', errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === `API route error for request ${i}`;
    });

    await request.get(`/api/request-error?request=${i}`);

    const errorEvent = await errorEventPromise;

    expect(errorEvent).toMatchObject({
      environment: 'qa',
      exception: {
        values: [
          {
            mechanism: expect.objectContaining({ handled: false }),
            type: 'Error',
            value: `API route error for request ${i}`,
          },
        ],
      },
      request: {
        method: 'GET',
        url: expect.stringContaining(`/api/request-error?request=${i}`),
      },
      sdk: {
        name: 'sentry.javascript.astro',
      },
    });
  }
});
