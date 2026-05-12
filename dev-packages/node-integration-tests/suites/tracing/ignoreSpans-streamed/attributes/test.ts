import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';

describe('filtering segment spans by attribute with ignoreSpans (streaming)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'server.mjs', 'instrument.mjs', (createRunner, test) => {
    test('segment spans matching an attribute filter are dropped including all children', async () => {
      const runner = createRunner()
        .unignore('client_report')
        .expect({
          client_report: {
            discarded_events: [
              {
                category: 'span',
                quantity: 5, // 1 segment ignored + 4 child spans (implicitly ignored)
                reason: 'ignored',
              },
            ],
          },
        })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(5);
            const segmentSpan = container.items.find(s => s.name === 'GET /keep' && !!s.is_segment);

            expect(segmentSpan).toBeDefined();
            expect(container.items.every(s => s.trace_id === segmentSpan!.trace_id)).toBe(true);
          },
        })
        .start();

      const dropRes = await runner.makeRequest('post', '/drop');
      expect((dropRes as { status: string }).status).toBe('dropped');

      const keepRes = await runner.makeRequest('get', '/keep');
      expect((keepRes as { status: string }).status).toBe('kept');

      await runner.completed();
    });
  });
});
