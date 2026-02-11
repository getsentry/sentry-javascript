import { expect, test } from 'vitest';
import { createRunner } from '../../../../utils/runner';

test('envelope header for transaction event with source=url correct', async () => {
  await createRunner(__dirname, 'scenario.ts')
    .expectHeader({
      transaction: {
        trace: {
          trace_id: expect.stringMatching(/[a-f\d]{32}/),
          public_key: 'public',
          environment: 'production',
          release: '1.0',
          sample_rate: '1',
          sampled: 'true',
          sample_rand: expect.any(String),
        },
      },
    })
    .start()
    .completed();
});
