import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

describe('logger public API', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('captures logs with custom scopes and parameters in different forms', async () => {
    const runner = createRunner(__dirname, 'subject.ts')
      .expect({
        log: logsContainer => {
          expect(logsContainer).toEqual({
            items: [
              {
                attributes: {
                  foo: {
                    type: 'string',
                    value: 'bar1',
                  },
                  'sentry.sdk.name': {
                    type: 'string',
                    value: 'sentry.javascript.node',
                  },
                  'sentry.sdk.version': {
                    type: 'string',
                    value: expect.any(String),
                  },
                  'server.address': {
                    type: 'string',
                    value: 'M6QX4Q5HKV.local',
                  },
                  'user.name': {
                    type: 'string',
                    value: 'h4cktor',
                  },
                },
                body: 'test info',
                level: 'info',
                severity_number: 9,
                timestamp: expect.any(Number),
                trace_id: expect.stringMatching(/^[\da-f]{32}$/),
              },
              {
                attributes: {
                  foo: {
                    type: 'string',
                    value: 'bar2',
                  },
                  'sentry.message.parameter.0': {
                    type: 'integer',
                    value: 1,
                  },
                  'sentry.message.template': {
                    type: 'string',
                    value: 'test info with %d',
                  },
                  'sentry.sdk.name': {
                    type: 'string',
                    value: 'sentry.javascript.node',
                  },
                  'sentry.sdk.version': {
                    type: 'string',
                    value: expect.any(String),
                  },
                  'server.address': {
                    type: 'string',
                    value: 'M6QX4Q5HKV.local',
                  },
                  'user.name': {
                    type: 'string',
                    value: 'h4cktor',
                  },
                },
                body: 'test info with 1',
                level: 'info',
                severity_number: 9,
                timestamp: expect.any(Number),
                trace_id: expect.stringMatching(/^[\da-f]{32}$/),
              },
              {
                attributes: {
                  foo: {
                    type: 'string',
                    value: 'bar3',
                  },
                  'sentry.message.parameter.0': {
                    type: 'integer',
                    value: 1,
                  },
                  'sentry.message.template': {
                    type: 'string',
                    value: 'test info with fmt %s',
                  },
                  'sentry.sdk.name': {
                    type: 'string',
                    value: 'sentry.javascript.node',
                  },
                  'sentry.sdk.version': {
                    type: 'string',
                    value: expect.any(String),
                  },
                  'server.address': {
                    type: 'string',
                    value: 'M6QX4Q5HKV.local',
                  },
                  'user.name': {
                    type: 'string',
                    value: 'h4cktor',
                  },
                },
                body: 'test info with fmt 1',
                level: 'info',
                severity_number: 9,
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
