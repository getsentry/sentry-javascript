import { SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '@sentry/node';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

describe('express tracing', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  describe('CJS', () => {
    // This test documents the unfortunate behaviour of using `span.updateName` on the server-side.
    // For http.server root spans (which is the root span on the server 99% of the time), Otel's http instrumentation
    // calls `span.updateName` and overwrites whatever the name was set to before (by us or by users).
    test("calling just `span.updateName` doesn't update the final name in express (missing source)", done => {
      createRunner(__dirname, 'server.js')
        .expect({
          transaction: {
            transaction: 'GET /test/:id/span-updateName',
            transaction_info: {
              source: 'route',
            },
          },
        })
        .start(done)
        .makeRequest('get', '/test/123/span-updateName');
    });

    // Also calling `updateName` AND setting a source doesn't change anything - Otel has no concept of source, this is sentry-internal.
    // Therefore, only the source is updated but the name is still overwritten by Otel.
    test("calling `span.updateName` and setting attribute source doesn't update the final name in express but it updates the source", done => {
      createRunner(__dirname, 'server.js')
        .expect({
          transaction: {
            transaction: 'GET /test/:id/span-updateName-source',
            transaction_info: {
              source: 'custom',
            },
          },
        })
        .start(done)
        .makeRequest('get', '/test/123/span-updateName-source');
    });

    // This test documents the correct way to update the span name (and implicitly the source) in Node:
    test('calling `Sentry.updateSpanName` updates the final name and source in express', done => {
      createRunner(__dirname, 'server.js')
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
            expect(txnEvent.contexts?.trace?.data?.['_sentry_span_name_set_by_user']).toBeUndefined();
          },
        })
        .start(done)
        .makeRequest('get', '/test/123/updateSpanName');
    });
  });

  // This test documents the correct way to update the span name (and implicitly the source) in Node:
  test('calling `Sentry.updateSpanName` and setting source subsequently updates the final name and sets correct source', done => {
    createRunner(__dirname, 'server.js')
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
          expect(txnEvent.contexts?.trace?.data?.['_sentry_span_name_set_by_user']).toBeUndefined();
        },
      })
      .start(done)
      .makeRequest('get', '/test/123/updateSpanNameAndSource');
  });
});
