import { expect, vi } from 'vitest';
import { createEsmAndCjsTests } from '../../../utils/runner';

createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
  test('isolates concurrent requests and leaves logs and metrics unenriched, with and without tracing', async () => {
    for (const { tracing, frameworkRoot } of [
      { tracing: true, frameworkRoot: '' },
      { tracing: false, frameworkRoot: '' },
      { tracing: true, frameworkRoot: 'forked-scope' },
      { tracing: true, frameworkRoot: 'late-op' },
    ]) {
      const runner = createRunner()
        .withEnv({
          AWS_LAMBDA_HTTP_ENDPOINT: '0.0.0.0:3000',
          AWS_REGION: 'us-east-1',
          AWS_ACCOUNT_ID: '123456789012',
          AWS_LAMBDA_FUNCTION_MEMORY_SIZE: '2048',
          AWS_LAMBDA_INITIALIZATION_TYPE: 'native-http',
          AWS_EXECUTION_ENV: 'AWS_Lambda_nodejs24.x-lite',
          NO_TRACING: tracing ? '' : '1',
          FRAMEWORK_ROOT: frameworkRoot,
        })
        .unordered();
      const spans = [];
      for (const request of ['first', 'second']) {
        runner.expect({
          event: {
            exception: { values: [expect.objectContaining({ value: request })] },
            contexts: {
              cloud_resource: {
                'cloud.provider': 'aws',
                'cloud.platform': 'aws_lambda',
                'cloud.region': 'us-east-1',
                'cloud.account.id': '123456789012',
              },
              'aws.lambda': {
                memory_size: 2048,
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
              span => span.attributes['faas.invocation_id']?.value === request,
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
            'sentry.op': { type: 'string', value: 'http.server' },
            'cloud.platform': { type: 'string', value: 'aws_lambda' },
            'cloud.region': { type: 'string', value: 'us-east-1' },
            'aws.lambda.memory_size': { type: 'integer', value: 2048 },
            'faas.coldstart': { type: 'boolean', value: request === 'first' },
            'faas.invocation_id': { type: 'string', value: request },
            'aws.lambda.web.endpoint_name': { type: 'string', value: `${request}-endpoint` },
          },
        });
      }
    }
  });
});
