import { SENTRY_SEGMENT_NAME_SOURCE } from '@sentry/conventions/attributes';
import { SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME } from '@sentry/core';

import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createCjsTests } from '../../../../utils/runner';

describe('express tracing - updateName', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    // This test documents the unfortunate behaviour of using `span.updateName` on the server-side.
    // For http.server root spans (which is the root span on the server 99% of the time), Otel's http instrumentation
    // calls `span.updateName` and overwrites whatever the name was set to before (by us or by users).
    test('calling just `span.updateName` updates the final name in express', async () => {
      const runner = createRunner()
        .expect({
          transaction: {
            transaction: 'new-name',
            transaction_info: {
              source: 'custom',
            },
          },
        })
        .start();
      runner.makeRequest('get', '/test/123/span-updateName');
      await runner.completed();
    });

    // This test documents the correct way to update the span name (and implicitly the source) in Node:
    test('calling `Sentry.updateSpanName` updates the final name and source in express', async () => {
      const runner = createRunner()
        .expect({
          transaction: txnEvent => {
            expect(txnEvent).toMatchObject({
              transaction: 'new-name',
              transaction_info: {
                source: 'custom',
              },
              contexts: {
                trace: {
                  op: 'http.server',
                  data: { [SENTRY_SEGMENT_NAME_SOURCE]: 'custom' },
                },
              },
            });
            // ensure we delete the internal attribute once we're done with it
            expect(txnEvent.contexts?.trace?.data?.[SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME]).toBeUndefined();
          },
        })
        .start();
      runner.makeRequest('get', '/test/123/updateSpanName');
      await runner.completed();
    });

    // This test documents the correct way to update the span name (and implicitly the source) in Node:
    test('calling `Sentry.updateSpanName` and setting source subsequently updates the final name and sets correct source', async () => {
      const runner = createRunner()
        .expect({
          transaction: txnEvent => {
            expect(txnEvent).toMatchObject({
              transaction: 'new-name',
              transaction_info: {
                source: 'component',
              },
              contexts: {
                trace: {
                  op: 'http.server',
                  data: { [SENTRY_SEGMENT_NAME_SOURCE]: 'component' },
                },
              },
            });
            // ensure we delete the internal attribute once we're done with it
            expect(txnEvent.contexts?.trace?.data?.[SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME]).toBeUndefined();
          },
        })
        .start();
      runner.makeRequest('get', '/test/123/updateSpanNameAndSource');
      await runner.completed();
    });
  });
});
