import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test.describe('Cloudflare Runtime', () => {
  test('Should report cloudflare as the runtime in API route error events', async ({ request }) => {
    const errorEventPromise = waitForError('nextjs-16-cf-workers', errorEvent => {
      return !!errorEvent?.exception?.values?.some(value =>
        value.value?.includes('This is a test error from an API route'),
      );
    });

    request.get('/api/test-error').catch(() => {
      // Expected to fail
    });

    const errorEvent = await errorEventPromise;

    expect(errorEvent.contexts?.runtime).toEqual({
      name: 'cloudflare',
    });

    // The SDK info should include cloudflare in the packages
    expect(errorEvent.sdk?.packages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'npm:@sentry/nextjs',
        }),
        expect.objectContaining({
          name: 'npm:@sentry/cloudflare',
        }),
      ]),
    );
  });
});
