import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('express ignoreLayersType', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('suppresses spans for layer types listed in ignoreLayersType', async () => {
      const runner = createRunner()
        .expect({
          span: container => {
            expect(container.items.find(item => item.is_segment)).toMatchObject({
              name: 'GET /test/express',
              status: 'ok',
              attributes: expect.objectContaining({
                'sentry.op': { type: 'string', value: 'http.server' },
              }),
            });
            expect(container.items).toContainEqual(
              expect.objectContaining({
                attributes: expect.objectContaining({
                  'express.type': { type: 'string', value: 'request_handler' },
                }),
              }),
            );
            // The cors() middleware span is suppressed by ignoreLayersType: ['middleware'].
            expect(container.items).not.toContainEqual(
              expect.objectContaining({
                attributes: expect.objectContaining({
                  'express.type': { type: 'string', value: 'middleware' },
                }),
              }),
            );
          },
        })
        .start();
      runner.makeRequest('get', '/test/express');
      await runner.completed();
    });
  });
});
