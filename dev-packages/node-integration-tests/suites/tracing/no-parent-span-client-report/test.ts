import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('no_parent_span client report', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('records no_parent_span outcome for http.client span without a local parent', async () => {
      const runner = createRunner()
        .unignore('client_report')
        .expect({
          client_report: report => {
            expect(report.discarded_events).toEqual([
              {
                category: 'span',
                quantity: 1,
                reason: 'no_parent_span',
              },
            ]);
          },
        })
        .start();

      await runner.completed();
    });
  });
});
