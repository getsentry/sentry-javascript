import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('express client abort', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('ends the request handler span when the client aborts', async () => {
      const runner = createRunner()
        .unordered()
        .expect({
          span: container => {
            const segmentSpan = container.items.find(item => item.is_segment);
            const handlerSpan = container.items.find(
              item => item.attributes['express.type']?.value === 'request_handler',
            );

            expect(segmentSpan?.name).toBe('GET /test/slow');
            expect(handlerSpan).toBeDefined();
            expect(handlerSpan!.parent_span_id).toBe(segmentSpan!.span_id);
            // Ends when the client aborts, not when the handler's 500ms of work finishes.
            expect(handlerSpan!.end_timestamp - handlerSpan!.start_timestamp).toBeLessThan(0.4);
          },
        })
        .start();

      await runner.makeRequest('get', '/test/slow', { timeout: 100, expectError: true });
      await runner.completed();
    });
  });
});
