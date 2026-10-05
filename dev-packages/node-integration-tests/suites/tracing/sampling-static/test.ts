import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('negative sampling (static)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'server.mjs', 'instrument.mjs', (createRunner, test) => {
    test('records sample_rate outcomes for the transaction and all of its spans', async () => {
      // `/health` and `/ok` go through the same middleware, so the `/ok` transaction tells us how many
      // spans the dropped `/health` transaction woudl have had. The count differs per runtime (e.g. Bun creates
      // no Express spans), so we derive it instead of hardcoding it.
      let okSpanCount: number | undefined;
      let droppedSpanCount: number | undefined;

      const runner = createRunner()
        .unignore('client_report')
        // The `GET /ok` transaction is sent as soon as its span ends, while the negatively-sampled
        // `/health` outcome only leaves via the client report flushed on `clientReportFlushInterval`.
        // These two envelopes come from independent flush mechanisms, so their arrival order races —
        // match unordered instead of asserting a fixed sequence.
        .unordered()
        .expect({
          transaction: transaction => {
            expect(transaction.transaction).toBe('GET /ok');
            okSpanCount = 1 + (transaction.spans?.length ?? 0);
          },
        })
        .expect({
          client_report: clientReport => {
            expect(clientReport.discarded_events).toEqual([
              { category: 'transaction', quantity: 1, reason: 'sample_rate' },
              { category: 'span', quantity: expect.any(Number), reason: 'sample_rate' },
            ]);
            droppedSpanCount = clientReport.discarded_events[1]!.quantity;
          },
        })
        .start();

      const res = await runner.makeRequest('get', '/health');
      expect((res as { status: string }).status).toBe('ok-health');

      const res2 = await runner.makeRequest('get', '/ok'); // contains all spans
      expect((res2 as { status: string }).status).toBe('ok');

      await runner.completed();

      expect(droppedSpanCount).toBe(okSpanCount);
    });
  });
});
