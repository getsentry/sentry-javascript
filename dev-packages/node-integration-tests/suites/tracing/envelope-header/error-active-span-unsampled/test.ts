import { expect, test } from 'vitest';
import { createRunner } from '../../../../utils/runner';

test('envelope header for error event during active unsampled span is correct', async () => {
  await createRunner(__dirname, 'scenario.ts')
    .ignore('transaction')
    .expectHeader({
      event: {
        trace: {
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          public_key: 'public',
          environment: 'production',
          release: '1.0',
          sample_rate: '0',
          sampled: 'false',
          sample_rand: expect.any(String),
        },
      },
    })
    .start()
    .completed();
});
