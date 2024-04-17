import { createRunner } from '../../../../utils/runner';

test('envelope header for error events is correct', done => {
  createRunner(__dirname, 'scenario.ts')
    .ignore('session', 'sessions')
    .expectHeader({
      event: {
        trace: {
          trace_id: expect.any(String),
          environment: 'production',
          public_key: 'public',
          release: '1.0',
        },
      },
    })
    .start(done);
});
