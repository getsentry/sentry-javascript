import { afterAll, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should log messages with different levels and formats', async () => {
  await createRunner(__dirname, 'scenario.ts')
    .expect({
      otel_log: {
        severityText: 'trace',
        severityNumber: 1, // TRACE
        body: {
          stringValue: 'test trace',
        },
        attributes: [
          { key: 'release', value: { stringValue: '1.0' } },
          { key: 'environment', value: { stringValue: 'test' } },
        ],
      },
    })
    .expect({
      otel_log: {
        severityText: 'debug',
        severityNumber: 5, // DEBUG
        body: {
          stringValue: 'test debug',
        },
        attributes: [
          { key: 'release', value: { stringValue: '1.0' } },
          { key: 'environment', value: { stringValue: 'test' } },
        ],
      },
    })
    .expect({
      otel_log: {
        severityText: 'info',
        severityNumber: 9, // INFO
        body: {
          stringValue: 'test info',
        },
        attributes: [
          { key: 'release', value: { stringValue: '1.0' } },
          { key: 'environment', value: { stringValue: 'test' } },
        ],
      },
    })
    .expect({
      otel_log: {
        severityText: 'warn',
        severityNumber: 13, // WARN
        body: {
          stringValue: 'test warn',
        },
        attributes: [
          { key: 'release', value: { stringValue: '1.0' } },
          { key: 'environment', value: { stringValue: 'test' } },
        ],
      },
    })
    .expect({
      otel_log: {
        severityText: 'error',
        severityNumber: 17, // ERROR
        body: {
          stringValue: 'test error',
        },
        attributes: [
          { key: 'release', value: { stringValue: '1.0' } },
          { key: 'environment', value: { stringValue: 'test' } },
        ],
      },
    })
    .expect({
      otel_log: {
        severityText: 'fatal',
        severityNumber: 21, // FATAL
        body: {
          stringValue: 'test fatal',
        },
        attributes: [
          { key: 'release', value: { stringValue: '1.0' } },
          { key: 'environment', value: { stringValue: 'test' } },
        ],
      },
    })
    .expect({
      otel_log: {
        severityText: 'trace',
        severityNumber: 1, // TRACE
        body: {
          stringValue: 'test trace stringArg false 123',
        },
        attributes: [
          { key: 'release', value: { stringValue: '1.0' } },
          { key: 'environment', value: { stringValue: 'test' } },
          { key: 'sentry.message.template', value: { stringValue: 'test %s %s %s %s' } },
          { key: 'sentry.message.param.0', value: { stringValue: 'trace' } },
          { key: 'sentry.message.param.1', value: { stringValue: 'stringArg' } },
          { key: 'sentry.message.param.2', value: { boolValue: false } },
          { key: 'sentry.message.param.3', value: { doubleValue: 123 } },
        ],
      },
    })
    .expect({
      otel_log: {
        severityText: 'debug',
        severityNumber: 5, // DEBUG
        body: {
          stringValue: 'test debug stringArg false 123',
        },
        attributes: [
          { key: 'release', value: { stringValue: '1.0' } },
          { key: 'environment', value: { stringValue: 'test' } },
          { key: 'sentry.message.template', value: { stringValue: 'test %s %s %s %s' } },
          { key: 'sentry.message.param.0', value: { stringValue: 'debug' } },
          { key: 'sentry.message.param.1', value: { stringValue: 'stringArg' } },
          { key: 'sentry.message.param.2', value: { boolValue: false } },
          { key: 'sentry.message.param.3', value: { doubleValue: 123 } },
        ],
      },
    })
    .expect({
      otel_log: {
        severityText: 'info',
        severityNumber: 9, // INFO
        body: {
          stringValue: 'test info stringArg false 123',
        },
        attributes: [
          { key: 'release', value: { stringValue: '1.0' } },
          { key: 'environment', value: { stringValue: 'test' } },
          { key: 'sentry.message.template', value: { stringValue: 'test %s %s %s %s' } },
          { key: 'sentry.message.param.0', value: { stringValue: 'info' } },
          { key: 'sentry.message.param.1', value: { stringValue: 'stringArg' } },
          { key: 'sentry.message.param.2', value: { boolValue: false } },
          { key: 'sentry.message.param.3', value: { doubleValue: 123 } },
        ],
      },
    })
    .expect({
      otel_log: {
        severityText: 'warn',
        severityNumber: 13, // WARN
        body: {
          stringValue: 'test warn stringArg false 123',
        },
        attributes: [
          { key: 'release', value: { stringValue: '1.0' } },
          { key: 'environment', value: { stringValue: 'test' } },
          { key: 'sentry.message.template', value: { stringValue: 'test %s %s %s %s' } },
          { key: 'sentry.message.param.0', value: { stringValue: 'warn' } },
          { key: 'sentry.message.param.1', value: { stringValue: 'stringArg' } },
          { key: 'sentry.message.param.2', value: { boolValue: false } },
          { key: 'sentry.message.param.3', value: { doubleValue: 123 } },
        ],
      },
    })
    .expect({
      otel_log: {
        severityText: 'error',
        severityNumber: 17, // ERROR
        body: {
          stringValue: 'test error stringArg false 123',
        },
        attributes: [
          { key: 'release', value: { stringValue: '1.0' } },
          { key: 'environment', value: { stringValue: 'test' } },
          { key: 'sentry.message.template', value: { stringValue: 'test %s %s %s %s' } },
          { key: 'sentry.message.param.0', value: { stringValue: 'error' } },
          { key: 'sentry.message.param.1', value: { stringValue: 'stringArg' } },
          { key: 'sentry.message.param.2', value: { boolValue: false } },
          { key: 'sentry.message.param.3', value: { doubleValue: 123 } },
        ],
      },
    })
    .expect({
      otel_log: {
        severityText: 'fatal',
        severityNumber: 21, // FATAL
        body: {
          stringValue: 'test fatal stringArg false 123',
        },
        attributes: [
          { key: 'release', value: { stringValue: '1.0' } },
          { key: 'environment', value: { stringValue: 'test' } },
          { key: 'sentry.message.template', value: { stringValue: 'test %s %s %s %s' } },
          { key: 'sentry.message.param.0', value: { stringValue: 'fatal' } },
          { key: 'sentry.message.param.1', value: { stringValue: 'stringArg' } },
          { key: 'sentry.message.param.2', value: { boolValue: false } },
          { key: 'sentry.message.param.3', value: { doubleValue: 123 } },
        ],
      },
    })
    .expect({
      otel_log: {
        severityText: 'trace',
        severityNumber: 1, // TRACE
        body: {
          stringValue: 'test trace with node format',
        },
        attributes: [
          { key: 'sentry.message.template', value: { stringValue: 'test %s with node format' } },
          { key: 'sentry.message.param.0', value: { stringValue: 'trace' } },
          { key: 'release', value: { stringValue: '1.0' } },
          { key: 'environment', value: { stringValue: 'test' } },
        ],
      },
    })
    .expect({
      otel_log: {
        severityText: 'debug',
        severityNumber: 5, // DEBUG
        body: {
          stringValue: 'test debug with node format',
        },
        attributes: [
          { key: 'sentry.message.template', value: { stringValue: 'test %s with node format' } },
          { key: 'sentry.message.param.0', value: { stringValue: 'debug' } },
          { key: 'release', value: { stringValue: '1.0' } },
          { key: 'environment', value: { stringValue: 'test' } },
        ],
      },
    })
    .expect({
      otel_log: {
        severityText: 'info',
        severityNumber: 9, // INFO
        body: {
          stringValue: 'test info with node format',
        },
        attributes: [
          { key: 'sentry.message.template', value: { stringValue: 'test %s with node format' } },
          { key: 'sentry.message.param.0', value: { stringValue: 'info' } },
          { key: 'release', value: { stringValue: '1.0' } },
          { key: 'environment', value: { stringValue: 'test' } },
        ],
      },
    })
    .expect({
      otel_log: {
        severityText: 'warn',
        severityNumber: 13, // WARN
        body: {
          stringValue: 'test warn with node format',
        },
        attributes: [
          { key: 'sentry.message.template', value: { stringValue: 'test %s with node format' } },
          { key: 'sentry.message.param.0', value: { stringValue: 'warn' } },
          { key: 'release', value: { stringValue: '1.0' } },
          { key: 'environment', value: { stringValue: 'test' } },
        ],
      },
    })
    .expect({
      otel_log: {
        severityText: 'error',
        severityNumber: 17, // ERROR
        body: {
          stringValue: 'test error with node format',
        },
        attributes: [
          { key: 'sentry.message.template', value: { stringValue: 'test %s with node format' } },
          { key: 'sentry.message.param.0', value: { stringValue: 'error' } },
          { key: 'release', value: { stringValue: '1.0' } },
          { key: 'environment', value: { stringValue: 'test' } },
        ],
      },
    })
    .expect({
      otel_log: {
        severityText: 'fatal',
        severityNumber: 21, // FATAL
        body: {
          stringValue: 'test fatal with node format',
        },
        attributes: [
          { key: 'sentry.message.template', value: { stringValue: 'test %s with node format' } },
          { key: 'sentry.message.param.0', value: { stringValue: 'fatal' } },
          { key: 'release', value: { stringValue: '1.0' } },
          { key: 'environment', value: { stringValue: 'test' } },
        ],
      },
    })
    .start()
    .completed();
});
