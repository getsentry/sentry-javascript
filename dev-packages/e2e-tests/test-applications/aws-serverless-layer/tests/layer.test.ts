import { waitForTransaction, waitForError, waitForRequest } from '@sentry-internal/test-utils';
import { InvokeCommand } from '@aws-sdk/client-lambda';
import { test, expect } from './lambda-fixtures';

interface TunnelInvokeResult {
  attemptedDsn?: string;
  status: number;
  responseBody: string;
}

function parseLambdaPayload(payload: Uint8Array | undefined): TunnelInvokeResult {
  if (!payload) {
    throw new Error('Missing Lambda payload');
  }

  return JSON.parse(Buffer.from(payload).toString('utf8')) as TunnelInvokeResult;
}

test.describe('Lambda layer', () => {
  test('tracing in CJS works', async ({ lambdaClient }) => {
    const transactionEventPromise = waitForTransaction('aws-serverless-layer', transactionEvent => {
      return transactionEvent?.transaction === 'LayerTracingCjs';
    });

    await lambdaClient.send(
      new InvokeCommand({
        FunctionName: 'LayerTracingCjs',
        Payload: JSON.stringify({}),
      }),
    );

    const transactionEvent = await transactionEventPromise;

    // shows the SDK sent a transaction
    expect(transactionEvent.transaction).toEqual('LayerTracingCjs');
    expect(transactionEvent.contexts?.trace).toEqual({
      data: {
        'sentry.sample_rate': 1,
        'sentry.source': 'custom',
        'sentry.origin': 'auto.otel.aws_lambda',
        'sentry.op': 'function.aws.lambda',
        'cloud.account.id': '012345678912',
        'faas.execution': expect.any(String),
        'faas.id': 'arn:aws:lambda:us-east-1:012345678912:function:LayerTracingCjs',
        'faas.coldstart': true,
        'otel.kind': 'SERVER',
      },
      op: 'function.aws.lambda',
      origin: 'auto.otel.aws_lambda',
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      status: 'ok',
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    });

    expect(transactionEvent.spans).toHaveLength(2);

    // shows that the Otel Http instrumentation is working
    expect(transactionEvent.spans).toContainEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          'sentry.op': 'http.client',
          'sentry.origin': 'auto.http.otel.http',
          url: 'http://example.com/',
        }),
        description: 'GET http://example.com/',
        op: 'http.client',
      }),
    );

    // shows that the manual span creation is working
    expect(transactionEvent.spans).toContainEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          'sentry.op': 'test',
          'sentry.origin': 'manual',
        }),
        description: 'manual-span',
        op: 'test',
      }),
    );

    // shows that the SDK source is correctly detected
    expect(transactionEvent.sdk?.packages).toContainEqual(
      expect.objectContaining({ name: 'aws-lambda-layer:@sentry/aws-serverless' }),
    );
  });

  test('tracing in ESM works', async ({ lambdaClient }) => {
    const transactionEventPromise = waitForTransaction('aws-serverless-layer', transactionEvent => {
      return transactionEvent?.transaction === 'LayerTracingEsm';
    });

    await lambdaClient.send(
      new InvokeCommand({
        FunctionName: 'LayerTracingEsm',
        Payload: JSON.stringify({}),
      }),
    );

    const transactionEvent = await transactionEventPromise;

    // shows the SDK sent a transaction
    expect(transactionEvent.transaction).toEqual('LayerTracingEsm'); // name should be the function name
    expect(transactionEvent.contexts?.trace).toEqual({
      data: {
        'sentry.sample_rate': 1,
        'sentry.source': 'custom',
        'sentry.origin': 'auto.otel.aws_lambda',
        'sentry.op': 'function.aws.lambda',
        'cloud.account.id': '012345678912',
        'faas.execution': expect.any(String),
        'faas.id': 'arn:aws:lambda:us-east-1:012345678912:function:LayerTracingEsm',
        'faas.coldstart': true,
        'otel.kind': 'SERVER',
      },
      op: 'function.aws.lambda',
      origin: 'auto.otel.aws_lambda',
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      status: 'ok',
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    });

    expect(transactionEvent.spans).toHaveLength(2);

    // shows that the Otel Http instrumentation is working
    expect(transactionEvent.spans).toContainEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          'sentry.op': 'http.client',
          'sentry.origin': 'auto.http.otel.http',
          url: 'http://example.com/',
        }),
        description: 'GET http://example.com/',
        op: 'http.client',
      }),
    );

    // shows that the manual span creation is working
    expect(transactionEvent.spans).toContainEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          'sentry.op': 'test',
          'sentry.origin': 'manual',
        }),
        description: 'manual-span',
        op: 'test',
      }),
    );

    // shows that the SDK source is correctly detected
    expect(transactionEvent.sdk?.packages).toContainEqual(
      expect.objectContaining({ name: 'aws-lambda-layer:@sentry/aws-serverless' }),
    );
  });

  test('capturing errors works', async ({ lambdaClient }) => {
    const errorEventPromise = waitForError('aws-serverless-layer', errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'test';
    });

    await lambdaClient.send(
      new InvokeCommand({
        FunctionName: 'LayerError',
        Payload: JSON.stringify({}),
      }),
    );

    const errorEvent = await errorEventPromise;

    // shows the SDK sent an error event
    expect(errorEvent.exception?.values).toHaveLength(1);
    expect(errorEvent.exception?.values?.[0]).toEqual(
      expect.objectContaining({
        type: 'Error',
        value: 'test',
        mechanism: {
          type: 'auto.function.aws_serverless.otel',
          handled: false,
        },
      }),
    );
  });

  test('capturing errors works in ESM', async ({ lambdaClient }) => {
    const errorEventPromise = waitForError('aws-serverless-layer', errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'test esm';
    });

    await lambdaClient.send(
      new InvokeCommand({
        FunctionName: 'LayerErrorEsm',
        Payload: JSON.stringify({}),
      }),
    );

    const errorEvent = await errorEventPromise;

    // shows the SDK sent an error event
    expect(errorEvent.exception?.values).toHaveLength(1);
    expect(errorEvent.exception?.values?.[0]).toEqual(
      expect.objectContaining({
        type: 'Error',
        value: 'test esm',
        mechanism: {
          type: 'auto.function.aws_serverless.otel',
          handled: false,
        },
      }),
    );
  });

  test('streaming handlers work', async ({ lambdaClient }) => {
    const transactionEventPromise = waitForTransaction('aws-serverless-layer', transactionEvent => {
      return transactionEvent?.transaction === 'LayerStreaming';
    });

    await lambdaClient.send(
      new InvokeCommand({
        FunctionName: 'LayerStreaming',
        Payload: JSON.stringify({}),
      }),
    );

    const transactionEvent = await transactionEventPromise;

    expect(transactionEvent.transaction).toEqual('LayerStreaming');
    expect(transactionEvent.contexts?.trace).toEqual({
      data: {
        'sentry.sample_rate': 1,
        'sentry.source': 'custom',
        'sentry.origin': 'auto.otel.aws_lambda',
        'sentry.op': 'function.aws.lambda',
        'cloud.account.id': '012345678912',
        'faas.execution': expect.any(String),
        'faas.id': 'arn:aws:lambda:us-east-1:012345678912:function:LayerStreaming',
        'faas.coldstart': true,
        'otel.kind': 'SERVER',
      },
      op: 'function.aws.lambda',
      origin: 'auto.otel.aws_lambda',
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      status: 'ok',
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    });

    expect(transactionEvent.spans).toHaveLength(1);

    expect(transactionEvent.spans).toContainEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          'sentry.op': 'test',
          'sentry.origin': 'manual',
        }),
        description: 'manual-span',
        op: 'test',
      }),
    );
  });

  test('extension tunnel validates DSN allowlist and rejects invalid envelopes', async ({ lambdaClient }) => {
    const matchingMarker = `extension-tunnel-matching-${Date.now()}`;
    const matchingRequestPromise = waitForRequest('aws-serverless-layer', requestData => {
      return requestData.rawProxyRequestBody.includes(matchingMarker);
    });

    const matchingResponse = await lambdaClient.send(
      new InvokeCommand({
        FunctionName: 'LayerTunnel',
        Payload: JSON.stringify({
          marker: matchingMarker,
        }),
      }),
    );
    const matchingResult = parseLambdaPayload(matchingResponse.Payload);
    expect(matchingResult.status).toBe(200);
    await matchingRequestPromise;

    const mismatchedResponse = await lambdaClient.send(
      new InvokeCommand({
        FunctionName: 'LayerTunnel',
        Payload: JSON.stringify({
          // Keep host/project/port valid but change public key, so DSN stays valid and fails allowlist match.
          dsn: String(matchingResult.attemptedDsn).replace('://public@', '://unauthorized@'),
        }),
      }),
    );
    const mismatchedResult = parseLambdaPayload(mismatchedResponse.Payload);
    expect(mismatchedResult.status).toBe(403);
    expect(mismatchedResult.responseBody).toContain('DSN not allowed');

    const missingDsnResponse = await lambdaClient.send(
      new InvokeCommand({
        FunctionName: 'LayerTunnel',
        Payload: JSON.stringify({
          omitDsn: true,
        }),
      }),
    );
    const missingDsnResult = parseLambdaPayload(missingDsnResponse.Payload);
    expect(missingDsnResult.status).toBe(400);
    expect(missingDsnResult.responseBody).toContain('missing DSN');
  });

  test('extension tunnel forwards requests when SENTRY_DSN is missing', async ({ lambdaClient }) => {
    const marker = `extension-tunnel-no-sentry-dsn-${Date.now()}`;
    const noDsnRequestPromise = waitForRequest('aws-serverless-layer', requestData => {
      return requestData.rawProxyRequestBody.includes(marker);
    });

    const noDsnResponse = await lambdaClient.send(
      new InvokeCommand({
        FunctionName: 'LayerTunnelNoDsn',
        Payload: JSON.stringify({
          marker,
        }),
      }),
    );
    const noDsnResult = parseLambdaPayload(noDsnResponse.Payload);
    expect(noDsnResult.status).toBe(200);
    await noDsnRequestPromise;
  });
});
