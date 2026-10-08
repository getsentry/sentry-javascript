import { afterAll, describe, expect } from 'vitest';
import { supports } from '../../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('no_parent_span client report', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    // Bun before 1.4 does not instrument outgoing `node:http` requests.
    // See https://github.com/getsentry/sentry-javascript/issues/23881
    test.runIf(supports({ bunMin: '1.4.0' }))(
      'records no_parent_span outcome for an outgoing http request without a local parent',
      async () => {
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
      },
    );
  });

  createEsmAndCjsTests(__dirname, 'scenario-fetch.mjs', 'instrument.mjs', (createRunner, test) => {
    test('records no_parent_span outcome for an outgoing fetch request without a local parent', async () => {
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
