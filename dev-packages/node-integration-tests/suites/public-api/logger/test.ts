import type { SerializedLog } from '@sentry/core';
import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

const commonAttributes: SerializedLog['attributes'] = {
  'sentry.environment': {
    type: 'string',
    value: 'test',
  },
  'sentry.release': {
    type: 'string',
    value: '1.0.0',
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
    value: expect.any(String),
  },
};

describe('logs', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('captures logs with scope and log attributes', async () => {
    const runner = createRunner(__dirname, 'scenario.ts')
      .expect({
        log: logsContainer => {
          expect(logsContainer).toEqual({
            items: [
              {
                timestamp: expect.any(Number),
                level: 'info',
                body: 'log_before_any_scope',
                severity_number: 9,
                trace_id: expect.any(String),
                attributes: {
                  ...commonAttributes,
                  log_attr: { value: 'log_attr_1', type: 'string' },
                },
              },
              {
                timestamp: expect.any(Number),
                level: 'info',
                body: 'log_after_global_scope',
                severity_number: 9,
                trace_id: expect.any(String),
                attributes: {
                  ...commonAttributes,
                  global_scope_attr: { value: true, type: 'boolean' },
                  log_attr: { value: 'log_attr_2', type: 'string' },
                },
              },
              {
                timestamp: expect.any(Number),
                level: 'info',
                body: 'log_with_isolation_scope',
                severity_number: 9,
                trace_id: expect.any(String),
                attributes: {
                  ...commonAttributes,
                  global_scope_attr: { value: true, type: 'boolean' },
                  isolation_scope_1_attr: { value: 100, unit: 'millisecond', type: 'integer' },
                  log_attr: { value: 'log_attr_3', type: 'string' },
                },
              },
              {
                timestamp: expect.any(Number),
                level: 'info',
                body: 'log_with_scope',
                severity_number: 9,
                trace_id: expect.any(String),
                attributes: {
                  ...commonAttributes,
                  global_scope_attr: { value: true, type: 'boolean' },
                  isolation_scope_1_attr: { value: 100, unit: 'millisecond', type: 'integer' },
                  scope_attr: { value: 200, unit: 'millisecond', type: 'integer' },
                  log_attr: { value: 'log_attr_4', type: 'string' },
                },
              },
              {
                timestamp: expect.any(Number),
                level: 'info',
                body: 'log_with_scope_2',
                severity_number: 9,
                trace_id: expect.any(String),
                attributes: {
                  ...commonAttributes,
                  global_scope_attr: { value: true, type: 'boolean' },
                  isolation_scope_1_attr: { value: 100, unit: 'millisecond', type: 'integer' },
                  scope_2_attr: { value: 300, unit: 'millisecond', type: 'integer' },
                  log_attr: { value: 'log_attr_5', type: 'string' },
                },
              },
            ],
          });
        },
      })
      .start();

    await runner.completed();
  });
});
