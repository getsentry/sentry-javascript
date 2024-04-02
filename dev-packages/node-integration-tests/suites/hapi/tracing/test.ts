import type { Envelope } from '@sentry/types';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('Hapi Scope.', done => {
  createRunner(__dirname, 'server.js')
    .ignore('session', 'sessions', 'transaction')
    .withRecordedEnvelopes(4, (envelopes: Envelope[]) => {
      expect(envelopes.length).toBe(1);
    })
    .start(done)
    .makeConsecutiveRequests({
      method: 'get',
      path: '/',
      delay: 100,
      count: 4,
    });
});
