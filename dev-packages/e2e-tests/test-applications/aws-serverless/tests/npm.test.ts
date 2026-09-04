import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';
import { InvokeCommand } from '@aws-sdk/client-lambda';
import { test, expect } from './lambda-fixtures';

// This app runs with `traceLifecycle: 'stream'`, the SDK default. The `aws-serverless-layer` app
// covers the `'static'` lifecycle, so between the two both lifecycles stay under test.

function assertLambdaTrace(spans: SerializedStreamedSpan[], functionName: string): void {
  const segmentSpan = spans.find(span => span.is_segment);

  // `function.aws` span names are low cardinality: the function name, never the invocation URL.
  expect(segmentSpan?.name).toBe(functionName);
  expect(segmentSpan?.status).toBe('ok');
  expect(getSpanOp(segmentSpan!)).toBe('function.aws');

  expect(segmentSpan?.attributes).toMatchObject({
    'sentry.op': { value: 'function.aws', type: 'string' },
    'sentry.origin': { value: 'auto.aws_lambda', type: 'string' },
    'sentry.kind': { value: 'server', type: 'string' },
    'sentry.segment.name.source': { value: 'custom', type: 'string' },
    'cloud.account.id': { value: '012345678912', type: 'string' },
    'cloud.platform': { value: 'aws_lambda', type: 'string' },
    'cloud.provider': { value: 'aws', type: 'string' },
    'faas.coldstart': { value: true, type: 'boolean' },
    'faas.execution': { value: expect.any(String), type: 'string' },
    'faas.id': { value: `arn:aws:lambda:us-east-1:012345678912:function:${functionName}`, type: 'string' },
    // The name the span is named after also stays on the span, so it survives a rename.
    'faas.name': { value: functionName, type: 'string' },
    // Streamed spans have no event contexts, so the `aws.lambda` context the transaction used to
    // carry is stamped onto the segment span by `awsLambdaIntegration`.
    'aws.lambda.function_name': { value: functionName, type: 'string' },
    'aws.lambda.invoked_function_arn': {
      value: `arn:aws:lambda:us-east-1:012345678912:function:${functionName}`,
      type: 'string',
    },
    'aws.lambda.aws_request_id': { value: expect.any(String), type: 'string' },
    'aws.cloudwatch.logs.log_group': { value: expect.any(String), type: 'string' },
    'aws.cloudwatch.logs.log_stream': { value: expect.any(String), type: 'string' },
  });

  // shows that the Otel Http instrumentation is working
  expect(spans).toContainEqual(
    expect.objectContaining({
      name: 'GET example.com',
      parent_span_id: segmentSpan?.span_id,
      attributes: expect.objectContaining({
        'sentry.op': { value: 'http.client', type: 'string' },
        'sentry.origin': { value: 'auto.http.client', type: 'string' },
        'url.full': { value: 'http://example.com/', type: 'string' },
      }),
    }),
  );

  // shows that the manual span creation is working
  expect(spans).toContainEqual(
    expect.objectContaining({
      name: 'manual-span',
      parent_span_id: segmentSpan?.span_id,
      attributes: expect.objectContaining({
        'sentry.op': { value: 'manual', type: 'string' },
        'sentry.origin': { value: 'manual', type: 'string' },
      }),
    }),
  );
}

test.describe('NPM package', () => {
  for (const [label, functionName] of [
    ['CJS', 'NpmTracingCjs'],
    ['ESM', 'NpmTracingEsm'],
  ] as const) {
    test(`tracing in ${label} works`, async ({ lambdaClient }) => {
      const spansPromise = collectStreamedSpans('aws-serverless', spansOfTrace =>
        spansOfTrace.some(span => span.is_segment && span.name === functionName),
      );

      await lambdaClient.send(new InvokeCommand({ FunctionName: functionName, Payload: JSON.stringify({}) }));

      const spans = await spansPromise;

      assertLambdaTrace(spans, functionName);
    });
  }
});
