import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('express client abort', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('ends the request handler span when the client aborts', async () => {
      const runner = createRunner()
        .expect({
          transaction: transaction => {
            const handlerSpan = transaction.spans?.find(span => span.data?.['express.type'] === 'request_handler');

            expect(transaction.transaction).toBe('GET /test/slow');
            expect(handlerSpan).toBeDefined();
            expect(handlerSpan!.parent_span_id).toBe(transaction.contexts?.trace?.span_id);
            expect(handlerSpan!.status).toBe('cancelled');
            // Ends when the client aborts, not when the handler's 500ms of work finishes.
            expect(handlerSpan!.timestamp! - handlerSpan!.start_timestamp).toBeLessThan(0.4);
          },
        })
        .start();

      await runner.makeRequest('get', '/test/slow', { timeout: 100, expectError: true });
      await runner.completed();
    });
  });
});
