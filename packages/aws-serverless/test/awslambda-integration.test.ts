import type { StreamedSpanJSON } from '@sentry/core';
import { describe, expect, test, vi } from 'vitest';
import { awsLambdaIntegration } from '../src/integration/awslambda';

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

vi.mock('@sentry/node', async () => {
  const original = await vi.importActual('@sentry/node');
  return {
    ...original,
    generateInstrumentOnce: () => () => {},
  };
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
