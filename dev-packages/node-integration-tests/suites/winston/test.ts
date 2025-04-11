import { afterAll, describe, test, expect } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../utils/runner';

describe('winston integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('should capture winston logs with default levels', async () => {
    const runner = createRunner(__dirname, 'subject.ts')
      .expect({
        otel_log: {
          severityText: 'info',
          body: {
            stringValue: 'Test info message',
          },
          attributes: [
            {
              key: 'sentry.origin',
              value: {
                stringValue: 'auto.logging.winston',
              },
            },
            {
              key: 'server.address',
              value: {
                stringValue: expect.any(String),
              },
            },
            {
              key: 'sentry.release',
              value: {
                stringValue: '1.0.0',
              },
            },
            {
              key: 'sentry.environment',
              value: {
                stringValue: 'test',
              },
            },
            {
              key: 'sentry.sdk.name',
              value: {
                stringValue: 'sentry.javascript.node',
              },
            },
            {
              key: 'sentry.sdk.version',
              value: {
                stringValue: expect.any(String),
              },
            },
          ],
        },
      })
      .expect({
        otel_log: {
          severityText: 'error',
          body: {
            stringValue: 'Test error message',
          },
          attributes: [
            {
              key: 'sentry.origin',
              value: {
                stringValue: 'auto.logging.winston',
              },
            },
            {
              key: 'server.address',
              value: {
                stringValue: expect.any(String),
              },
            },
            {
              key: 'sentry.release',
              value: {
                stringValue: '1.0.0',
              },
            },
            {
              key: 'sentry.environment',
              value: {
                stringValue: 'test',
              },
            },
            {
              key: 'sentry.sdk.name',
              value: {
                stringValue: 'sentry.javascript.node',
              },
            },
            {
              key: 'sentry.sdk.version',
              value: {
                stringValue: expect.any(String),
              },
            },
          ],
        },
      })
      .start();

    await runner.completed();
  });

  test('should capture winston logs with custom levels', async () => {
    const runner = createRunner(__dirname, 'subject.ts')
      .withEnv({ CUSTOM_LEVELS: 'true' })
      .expect({
        otel_log: {
          severityText: 'info',
          body: {
            stringValue: 'Test info message',
          },
          attributes: [
            {
              key: 'sentry.origin',
              value: {
                stringValue: 'auto.logging.winston',
              },
            },
            {
              key: 'server.address',
              value: {
                stringValue: expect.any(String),
              },
            },
            {
              key: 'sentry.release',
              value: {
                stringValue: '1.0.0',
              },
            },
            {
              key: 'sentry.environment',
              value: {
                stringValue: 'test',
              },
            },
            {
              key: 'sentry.sdk.name',
              value: {
                stringValue: 'sentry.javascript.node',
              },
            },
            {
              key: 'sentry.sdk.version',
              value: {
                stringValue: expect.any(String),
              },
            },
          ],
        },
      })
      .expect({
        otel_log: {
          severityText: 'error',
          body: {
            stringValue: 'Test error message',
          },
          attributes: [
            {
              key: 'sentry.origin',
              value: {
                stringValue: 'auto.logging.winston',
              },
            },
            {
              key: 'server.address',
              value: {
                stringValue: expect.any(String),
              },
            },
            {
              key: 'sentry.release',
              value: {
                stringValue: '1.0.0',
              },
            },
            {
              key: 'sentry.environment',
              value: {
                stringValue: 'test',
              },
            },
            {
              key: 'sentry.sdk.name',
              value: {
                stringValue: 'sentry.javascript.node',
              },
            },
            {
              key: 'sentry.sdk.version',
              value: {
                stringValue: expect.any(String),
              },
            },
          ],
        },
      })
      .start();

    await runner.completed();
  });

  test('should capture winston logs with metadata', async () => {
    const runner = createRunner(__dirname, 'subject.ts')
      .withEnv({ WITH_METADATA: 'true' })
      .expect({
        otel_log: {
          severityText: 'info',
          body: {
            stringValue: 'Test info message',
          },
          attributes: [
            {
              key: 'sentry.origin',
              value: {
                stringValue: 'auto.logging.winston',
              },
            },
            {
              key: 'server.address',
              value: {
                stringValue: expect.any(String),
              },
            },
            {
              key: 'sentry.release',
              value: {
                stringValue: '1.0.0',
              },
            },
            {
              key: 'sentry.environment',
              value: {
                stringValue: 'test',
              },
            },
            {
              key: 'sentry.sdk.name',
              value: {
                stringValue: 'sentry.javascript.node',
              },
            },
            {
              key: 'sentry.sdk.version',
              value: {
                stringValue: expect.any(String),
              },
            },
          ],
        },
      })
      .expect({
        otel_log: {
          severityText: 'error',
          body: {
            stringValue: 'Test error message',
          },
          attributes: [
            {
              key: 'sentry.origin',
              value: {
                stringValue: 'auto.logging.winston',
              },
            },
            {
              key: 'server.address',
              value: {
                stringValue: expect.any(String),
              },
            },
            {
              key: 'sentry.release',
              value: {
                stringValue: '1.0.0',
              },
            },
            {
              key: 'sentry.environment',
              value: {
                stringValue: 'test',
              },
            },
            {
              key: 'sentry.sdk.name',
              value: {
                stringValue: 'sentry.javascript.node',
              },
            },
            {
              key: 'sentry.sdk.version',
              value: {
                stringValue: expect.any(String),
              },
            },
          ],
        },
      })
      .start();

    await runner.completed();
  });
});
