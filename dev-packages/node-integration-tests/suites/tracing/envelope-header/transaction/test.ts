import { createRunner } from '../../../../utils/runner';

test('envelope header for transaction event is correct', done => {
  createRunner(__dirname, 'scenario.ts')
    .expectHeader({
      transaction: {
        trace: {
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          public_key: 'public',
          environment: 'production',
          release: '1.0',
          sample_rate: '1',
          sampled: 'true',
          transaction: 'test span',
        },
      },
    })
    .start(done);
});
