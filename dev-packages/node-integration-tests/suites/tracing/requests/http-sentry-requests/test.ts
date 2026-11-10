import { SENTRY_OP, URL_FULL } from '@sentry/conventions/attributes';
import { HTTP_CLIENT } from '@sentry/conventions/op';
import { createTestServer } from '@sentry-internal/test-utils';
import { describe, expect } from 'vitest';
import { createEsmAndCjsTests } from '../../../../utils/runner';
import { supports } from '../../../../utils';

// Bun before 1.4 does not instrument outgoing `node:http` requests.
// See https://github.com/getsentry/sentry-javascript/issues/23881
describe.runIf(supports({ bunMin: '1.4.0' }))('outgoing http requests to Sentry', () => {
  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('does not create spans for requests to Sentry', async () => {
      const [SERVER_URL, closeTestServer] = await createTestServer().start();

      await createRunner()
        .withEnv({ SERVER_URL })
        .expect({
          span: container => {
            const requestSpans = container.items.filter(span => span.attributes[SENTRY_OP]?.value === HTTP_CLIENT);
            expect(requestSpans.map(span => span.attributes[URL_FULL]?.value)).toEqual([`${SERVER_URL}/api/v0`]);
          },
        })
        .start()
        .completed();
      closeTestServer();
    });
  });
});
