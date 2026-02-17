import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

describe('light mode logs', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('captures logs with trace context', async () => {
    const runner = createRunner(__dirname, 'subject.js')
      .expect({
        log: logsContainer => {
          expect(logsContainer).toEqual({
            items: [
              {
                attributes: {
                  key: { type: 'string', value: 'value' },
                  'sentry.release': { type: 'string', value: '1.0.0' },
                  'sentry.sdk.name': { type: 'string', value: 'sentry.javascript.node-light' },
                  'sentry.sdk.version': { type: 'string', value: expect.any(String) },
                  'server.address': { type: 'string', value: expect.any(String) },
                },
                body: 'test info log',
                level: 'info',
                severity_number: 9,
                timestamp: expect.any(Number),
                trace_id: expect.stringMatching(/^[\da-f]{32}$/),
              },
              {
                attributes: {
                  'sentry.release': { type: 'string', value: '1.0.0' },
                  'sentry.sdk.name': { type: 'string', value: 'sentry.javascript.node-light' },
                  'sentry.sdk.version': { type: 'string', value: expect.any(String) },
                  'server.address': { type: 'string', value: expect.any(String) },
                },
                body: 'test error log',
                level: 'error',
                severity_number: 17,
                timestamp: expect.any(Number),
                trace_id: expect.stringMatching(/^[\da-f]{32}$/),
              },
            ],
          });
        },
      })
      .start();

    await runner.completed();
  });
});
