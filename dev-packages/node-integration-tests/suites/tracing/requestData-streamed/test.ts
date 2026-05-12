import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('requestData-streamed', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'server.mjs', 'instrument.mjs', (createRunner, test) => {
    test('applies request data attributes to the segment span', async () => {
      const runner = createRunner()
        .expect({
          span: container => {
            const serverSpan = container.items.find(item => item.is_segment);

            expect(serverSpan).toBeDefined();

            expect(serverSpan?.attributes?.['url.full']).toEqual({
              type: 'string',
              value: expect.stringContaining('/test?foo=bar'),
            });

            expect(serverSpan?.attributes?.['http.request.method']).toEqual({
              type: 'string',
              value: 'GET',
            });

            expect(serverSpan?.attributes?.['url.query']).toEqual({
              type: 'string',
              value: 'foo=bar',
            });

            expect(serverSpan?.attributes?.['http.request.header.host']).toEqual({
              type: 'string',
              value: expect.any(String),
            });

            expect(serverSpan?.attributes?.['user.ip_address']).toEqual({
              type: 'string',
              value: expect.any(String),
            });
          },
        })
        .start();

      await runner.makeRequest('get', '/test?foo=bar');

      await runner.completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'server.mjs', 'instrument-without-request-data.mjs', (createRunner, test) => {
    test('does not apply request data attributes when requestDataIntegration is removed', async () => {
      const runner = createRunner()
        .expect({
          span: container => {
            const serverSpan = container.items.find(item => item.is_segment);

            expect(serverSpan).toBeDefined();

            // url.query and user.ip_address are only set by applyScopeToSegmentSpan
            // (not by OTel instrumentation), so they should be absent when the integration is removed
            expect(serverSpan?.attributes?.['url.query']).toBeUndefined();
            expect(serverSpan?.attributes?.['user.ip_address']).toBeUndefined();
          },
        })
        .start();

      await runner.makeRequest('get', '/test?foo=bar');

      await runner.completed();
    });
  });
});
