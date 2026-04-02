import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('negative sampling (streaming)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'server.mjs', 'instrument.mjs', (createRunner, test) => {
    test('records sample_rate outcome for segment and child spans of negatively sampled segment', async () => {
      const runner = createRunner()
        .unignore('client_report')
        .expect({
          client_report: {
            discarded_events: [
              {
                category: 'span',
                quantity: 5, // 1 segment ignored + 4 child spans (implicitly ignored)
                reason: 'sample_rate',
              },
            ],
          },
        })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(5);
            const segmentSpan = container.items.find(s => s.name === 'GET /ok' && !!s.is_segment);

            expect(segmentSpan).toBeDefined();
            expect(container.items.every(s => s.trace_id === segmentSpan!.trace_id)).toBe(true);
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
