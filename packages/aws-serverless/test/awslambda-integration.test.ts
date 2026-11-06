import type { StreamedSpanJSON } from '@sentry/core';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { awsLambdaIntegration, redirectLambdaHandler } from '../src/integration/awslambda';

const mockGetScopeData = vi.fn();

vi.mock('@sentry/core', async () => {
  const original = await vi.importActual('@sentry/core');
  return {
    ...original,
    getCurrentScope: () => ({
      getScopeData: mockGetScopeData,
    }),
  };
});

describe('redirectLambdaHandler', () => {
  let taskRoot: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-lambda-test-'));
    fs.writeFileSync(path.join(taskRoot, 'index.js'), 'exports.handler = async () => {};');
    delete process.env._HANDLER;
    delete process.env.LAMBDA_TASK_ROOT;
    delete process.env.SENTRY_ORIGINAL_HANDLER;
  });

  afterEach(() => {
    fs.rmSync(taskRoot, { recursive: true, force: true });
    process.env = { ...originalEnv };
  });

  test('redirects _HANDLER to the shim and stores the original handler', () => {
    process.env.LAMBDA_TASK_ROOT = taskRoot;
    process.env._HANDLER = 'index.handler';

    redirectLambdaHandler();

    expect(process.env.SENTRY_ORIGINAL_HANDLER).toBe('index.handler');
    expect(process.env._HANDLER).toMatch(/\/run-lambda-handler\.handler$/);
    expect(process.env._HANDLER).not.toContain('..');
  });

  test('does nothing when LAMBDA_TASK_ROOT or _HANDLER are not set', () => {
    process.env._HANDLER = 'index.handler';

    redirectLambdaHandler();

    expect(process.env._HANDLER).toBe('index.handler');
    expect(process.env.SENTRY_ORIGINAL_HANDLER).toBeUndefined();
  });

  test('does nothing when the handler file cannot be resolved', () => {
    process.env.LAMBDA_TASK_ROOT = taskRoot;
    process.env._HANDLER = 'missing.handler';

    redirectLambdaHandler();

    expect(process.env._HANDLER).toBe('missing.handler');
    expect(process.env.SENTRY_ORIGINAL_HANDLER).toBeUndefined();
  });

  test('does nothing when the handler string is invalid', () => {
    process.env.LAMBDA_TASK_ROOT = taskRoot;
    process.env._HANDLER = 'no-function-name';

    redirectLambdaHandler();

    expect(process.env._HANDLER).toBe('no-function-name');
    expect(process.env.SENTRY_ORIGINAL_HANDLER).toBeUndefined();
  });

  test('does not redirect twice', () => {
    process.env.LAMBDA_TASK_ROOT = taskRoot;
    process.env._HANDLER = 'index.handler';

    redirectLambdaHandler();
    const redirectedHandler = process.env._HANDLER;

    redirectLambdaHandler();

    expect(process.env._HANDLER).toBe(redirectedHandler);
    expect(process.env.SENTRY_ORIGINAL_HANDLER).toBe('index.handler');
  });

  test('setupOnce redirects the handler', () => {
    process.env.LAMBDA_TASK_ROOT = taskRoot;
    process.env._HANDLER = 'index.handler';

    awsLambdaIntegration().setupOnce!();

    expect(process.env._HANDLER).toMatch(/\/run-lambda-handler\.handler$/);
    expect(process.env.SENTRY_ORIGINAL_HANDLER).toBe('index.handler');
  });
});

describe('awsLambdaIntegration processSegmentSpan', () => {
  function makeSpanJSON(): StreamedSpanJSON {
    return {
      name: 'test',
      span_id: 'abc',
      trace_id: 'def',
      start_timestamp: 0,
      end_timestamp: 1,
      status: 'ok',
      is_segment: true,
      attributes: {},
    };
  }

  test('maps aws.lambda context fields to segment span attributes', () => {
    mockGetScopeData.mockReturnValue({
      contexts: {
        'aws.lambda': {
          aws_request_id: 'req-123',
          function_name: 'my-function',
          function_version: '$LATEST',
          invoked_function_arn: 'arn:aws:lambda:us-east-1:123:function:my-function',
          execution_duration_in_millis: 150,
          remaining_time_in_millis: 2850,
          'sys.argv': ['/usr/bin/node', '--secret=abc'],
        },
      },
    });

    const integration = awsLambdaIntegration();
    const span = makeSpanJSON();
    integration.processSegmentSpan!(span, {} as any);

    expect(span.attributes).toEqual(
      expect.objectContaining({
        'aws.lambda.aws_request_id': 'req-123',
        'aws.lambda.function_name': 'my-function',
        'aws.lambda.function_version': '$LATEST',
        'aws.lambda.invoked_function_arn': 'arn:aws:lambda:us-east-1:123:function:my-function',
        'aws.lambda.execution_duration_in_millis': 150,
        'aws.lambda.remaining_time_in_millis': 2850,
      }),
    );
    expect(span.attributes).not.toHaveProperty('aws.lambda.sys.argv');
  });

  test('maps aws.cloudwatch.logs context fields to segment span attributes', () => {
    mockGetScopeData.mockReturnValue({
      contexts: {
        'aws.cloudwatch.logs': {
          log_group: '/aws/lambda/my-function',
          log_stream: '2024/01/01/[$LATEST]abc123',
          url: 'https://console.aws.amazon.com/cloudwatch/home',
        },
      },
    });

    const integration = awsLambdaIntegration();
    const span = makeSpanJSON();
    integration.processSegmentSpan!(span, {} as any);

    expect(span.attributes).toEqual(
      expect.objectContaining({
        'aws.cloudwatch.logs.log_group': '/aws/lambda/my-function',
        'aws.cloudwatch.logs.log_stream': '2024/01/01/[$LATEST]abc123',
        'aws.cloudwatch.logs.url': 'https://console.aws.amazon.com/cloudwatch/home',
      }),
    );
  });

  test('does nothing when no aws contexts are set', () => {
    mockGetScopeData.mockReturnValue({ contexts: {} });

    const integration = awsLambdaIntegration();
    const span = makeSpanJSON();
    integration.processSegmentSpan!(span, {} as any);

    expect(span.attributes).toEqual({});
  });
});
