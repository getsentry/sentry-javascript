import { SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME } from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '@sentry/node';
import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

describe('express tracing', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  describe('CJS', () => {
    // This test documents the unfortunate behaviour of using `span.updateName` on the server-side.
    // For http.server root spans (which is the root span on the server 99% of the time), Otel's http instrumentation
    // calls `span.updateName` and overwrites whatever the name was set to before (by us or by users).
    test("calling just `span.updateName` doesn't update the final name in express (missing source)", async () => {
      const runner = createRunner(__dirname, 'server.js')
        .expect({
          transaction: {
            transaction: 'GET /test/:id/span-updateName',
            transaction_info: {
              source: 'route',
            },
          },
        })
        .start();
      runner.makeRequest('get', '/test/123/span-updateName');
      await runner.completed();
    });

    // Also calling `updateName` AND setting a source doesn't change anything - Otel has no concept of source, this is sentry-internal.
    // Therefore, only the source is updated but the name is still overwritten by Otel.
    test('calling `span.updateName` and setting attribute source updates the final name in express', async () => {
      const runner = createRunner(__dirname, 'server.js')
        .expect({
          transaction: {
            transaction: 'new-name',
            transaction_info: {
              source: 'custom',
            },
          },
        })
        .start();
      runner.makeRequest('get', '/test/123/span-updateName-source');
      await runner.completed();
    });

    // This test documents the correct way to update the span name (and implicitly the source) in Node:
    test('calling `Sentry.updateSpanName` updates the final name and source in express', async () => {
      const runner = createRunner(__dirname, 'server.js')
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
                  data: { [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom' },
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
  });

  // This test documents the correct way to update the span name (and implicitly the source) in Node:
  test('calling `Sentry.updateSpanName` and setting source subsequently updates the final name and sets correct source', async () => {
    const runner = createRunner(__dirname, 'server.js')
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
                data: { [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component' },
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
