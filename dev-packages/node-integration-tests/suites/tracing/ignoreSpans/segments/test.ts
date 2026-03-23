import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP } from '@sentry/core';

describe('filtering segment spans with ignoreSpans (streaming)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  describe('CJS', () => {
    test('segment spans matching ignoreSpans are dropped including all children', async () => {
      const runner = createRunner(__dirname, 'server.js')
        .unignore('client_report')
        .expect({
          client_report: {
            discarded_events: [
              {
                category: 'span',
                quantity: 1,
                reason: 'ignored',
              },
            ],
          },
        })
        .expect({
          span: {
            items: expect.arrayContaining([
              expect.objectContaining({
                name: 'GET /ok',
                attributes: expect.objectContaining({
                  [SEMANTIC_ATTRIBUTE_SENTRY_OP]: {
                    value: 'http.server',
                    type: 'string',
                  },
                }),
              }),
            ]),
          },
        })
        .start();

      runner.makeRequest('get', '/health');
      runner.makeRequest('get', '/ok');

      await runner.completed();
    });
  });
});
