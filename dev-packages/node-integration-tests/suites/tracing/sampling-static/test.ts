import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('negative sampling (static)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'server.mjs', 'instrument.mjs', (createRunner, test) => {
    test('records sample_rate outcome for root span/transaction', async () => {
      const runner = createRunner()
        .unignore('client_report')
        .expect({
          transaction: {
            transaction: 'GET /ok',
          },
        })
        .expect({
          client_report: {
            discarded_events: [
              {
                category: 'transaction',
                quantity: 1,
                reason: 'sample_rate',
              },
            ],
          },
        })
        .start();

      const res = await runner.makeRequest('get', '/health');
      expect((res as { status: string }).status).toBe('ok-health');

      const res2 = await runner.makeRequest('get', '/ok'); // contains all spans
      expect((res2 as { status: string }).status).toBe('ok');

      await runner.completed();
    });
  });
});
