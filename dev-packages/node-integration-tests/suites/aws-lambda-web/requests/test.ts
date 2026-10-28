import {
  AWS_LAMBDA_WEB_ENDPOINT_NAME,
  CLOUD_PLATFORM,
  CLOUD_PROVIDER,
  CLOUD_REGION,
  FAAS_COLDSTART,
  FAAS_INVOCATION_ID,
  FAAS_MAX_MEMORY,
  SENTRY_OP,
} from '@sentry/conventions/attributes';
import { expect, vi } from 'vitest';
import { createEsmAndCjsTests } from '../../../utils/runner';

createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
  test.each([
    { name: 'default tracing', tracing: true },
    { name: 'tracing disabled', tracing: false },
  ])('$name: isolates concurrent requests and leaves logs and metrics unenriched', async ({ tracing }) => {
    const runner = createRunner()
      .withEnv({
        AWS_LAMBDA_HTTP_ENDPOINT: '0.0.0.0:3000',
        AWS_REGION: 'us-east-1',
        AWS_LAMBDA_FUNCTION_MEMORY_SIZE: '2048',
        AWS_LAMBDA_INITIALIZATION_TYPE: 'native-http',
        AWS_EXECUTION_ENV: 'AWS_Lambda_nodejs24.x-lite',
        NO_TRACING: tracing ? '' : '1',
      })
      .unordered();
    const spans = [];
    for (const request of ['first', 'second']) {
      runner.expect({
        event: {
          exception: { values: [expect.objectContaining({ value: request })] },
          contexts: {
            cloud_resource: {
              [CLOUD_PROVIDER]: 'aws',
              [CLOUD_PLATFORM]: 'aws_lambda',
              [CLOUD_REGION]: 'us-east-1',
            },
            'aws.lambda': {
              memory_size: 2_147_483_648,
              initialization_type: 'native-http',
              cold_start: request === 'first',
              aws_request_id: request,
              endpoint_name: `${request}-endpoint`,
            },
          },
        },
      });
      if (tracing) {
        spans.push({
          request,
          collected: runner.collectStreamedSpansUntilSegment(
            span => span.attributes[FAAS_INVOCATION_ID]?.value === request,
          ),
        });
      }
    }
    const assertUnenriched = (items: { attributes?: Record<string, unknown> }[]): void => {
      expect(items).toHaveLength(2);
      for (const item of items) {
        expect(Object.keys(item.attributes || {}).filter(key => /^(aws\.lambda\.|faas\.|cloud\.)/.test(key))).toEqual(
          [],
        );
      }
    };
    runner.expect({ log: container => assertUnenriched(container.items) });
    runner.expect({ trace_metric: container => assertUnenriched(container.items) });
    const running = runner.start();
    const first = running.makeRequest('get', '/first', {
      headers: { 'lambda-web-request-id': 'first', 'lambda-web-endpoint-name': 'first-endpoint' },
    });
    await vi.waitFor(() => expect(running.getLogs().join('\n')).toContain('FIRST_STARTED'), { timeout: 10_000 });
    await Promise.all([
      first,
      running.makeRequest('get', '/second', {
        headers: { 'lambda-web-request-id': 'second', 'lambda-web-endpoint-name': 'second-endpoint' },
      }),
    ]);
    await running.completed();
    for (const { request, collected } of spans) {
      const items = await collected;
      expect(items.find(item => item.is_segment)).toMatchObject({
        name: 'GET /:request',
        attributes: {
          [SENTRY_OP]: { type: 'string', value: 'http.server' },
          [CLOUD_PLATFORM]: { type: 'string', value: 'aws_lambda' },
          [CLOUD_REGION]: { type: 'string', value: 'us-east-1' },
          [FAAS_MAX_MEMORY]: { type: 'integer', value: 2_147_483_648 },
          [FAAS_COLDSTART]: { type: 'boolean', value: request === 'first' },
          [FAAS_INVOCATION_ID]: { type: 'string', value: request },
          [AWS_LAMBDA_WEB_ENDPOINT_NAME]: { type: 'string', value: `${request}-endpoint` },
        },
      });
    }
  });
});
