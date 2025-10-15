import { expect, test } from 'vitest';
import { createRunner } from '../../../../utils/runner';

test('envelope header for error events is correct', async ({ signal }) => {
  await createRunner({ signal }, __dirname, 'scenario.ts')
    .expectHeader({
      event: {
        trace: {
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          environment: 'production',
          public_key: 'public',
          release: '1.0',
        },
      },
    })
    .start()
    .completed();
});
