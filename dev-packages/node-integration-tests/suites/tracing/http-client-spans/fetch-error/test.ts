import { expect, test } from 'vitest';
import { createRunner } from '../../../../utils/runner';

test('captures an errored span for a failed outgoing fetch request', async () => {
  await createRunner(__dirname, 'scenario.ts')
    .expect({
      transaction: {
        transaction: 'test_transaction',
        spans: expect.arrayContaining([
          expect.objectContaining({
            description: expect.stringMatching(/GET http:\/\/localhost:\d+\//),
            op: 'http.client',
            origin: 'auto.http.otel.node_fetch',
            status: 'internal_error',
          }),
        ]),
      },
    })
    .start()
    .completed();
});
