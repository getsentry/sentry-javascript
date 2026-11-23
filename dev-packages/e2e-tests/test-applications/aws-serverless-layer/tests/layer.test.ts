import { waitForTransaction, waitForError, waitForRequest } from '@sentry-internal/test-utils';
import { InvokeCommand } from '@aws-sdk/client-lambda';
import * as http from 'node:http';
import * as net from 'node:net';
import { once } from 'node:events';
import { HTTP_PROXY_PORT } from '../src/stack';
import { test, expect } from './lambda-fixtures';

interface TunnelInvokeResult {
  attemptedDsn?: string;
  status: number;
  responseBody: string;
}

/**
 * A forward proxy that records each CONNECT target. The Lambda container reaches the host through its host IP, which
 * may not resolve on the host itself, so every tunnel goes to the same port on loopback.
 */
async function startConnectProxy(): Promise<{ connects: string[]; close: () => Promise<void> }> {
  const connects: string[] = [];
  const server = http.createServer();
  server.on('connect', (req: http.IncomingMessage, clientSocket: net.Socket) => {
    const target = req.url ?? '';
    connects.push(target);
    const upstream = net.connect(Number(target.split(':').pop()), '127.0.0.1', () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });
    upstream.on('error', () => clientSocket.destroy());
    clientSocket.on('error', () => upstream.destroy());
  });
  server.listen(HTTP_PROXY_PORT, '0.0.0.0');
  await once(server, 'listening');

  return {
    connects,
    close: () =>
      new Promise(resolve => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
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
        'sentry.segment.name.source': 'component',
        'sentry.origin': 'auto.function.aws_serverless',
        'sentry.op': 'function.aws',
        'cloud.account.id': '012345678912',
        'cloud.platform': 'aws_lambda',
        'cloud.provider': 'aws',
        'faas.invocation_id': expect.any(String),
        'cloud.resource_id': 'arn:aws:lambda:us-east-1:012345678912:function:LayerTracingCjs',
        'faas.name': 'LayerTracingCjs',
        'faas.coldstart': true,
        'sentry.kind': 'server',
      },
      op: 'function.aws',
      origin: 'auto.function.aws_serverless',
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
          'sentry.origin': 'auto.http.client',
          'url.full': 'http://example.com/',
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
        'sentry.segment.name.source': 'component',
        'sentry.origin': 'auto.function.aws_serverless',
        'sentry.op': 'function.aws',
        'cloud.account.id': '012345678912',
        'cloud.platform': 'aws_lambda',
        'cloud.provider': 'aws',
        'faas.invocation_id': expect.any(String),
        'cloud.resource_id': 'arn:aws:lambda:us-east-1:012345678912:function:LayerTracingEsm',
        'faas.name': 'LayerTracingEsm',
        'faas.coldstart': true,
        'sentry.kind': 'server',
      },
      op: 'function.aws',
      origin: 'auto.function.aws_serverless',
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
          'sentry.origin': 'auto.http.client',
          'url.full': 'http://example.com/',
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
        'sentry.segment.name.source': 'component',
        'sentry.origin': 'auto.function.aws_serverless',
        'sentry.op': 'function.aws',
        'cloud.account.id': '012345678912',
        'cloud.platform': 'aws_lambda',
        'cloud.provider': 'aws',
        'faas.invocation_id': expect.any(String),
        'cloud.resource_id': 'arn:aws:lambda:us-east-1:012345678912:function:LayerStreaming',
        'faas.name': 'LayerStreaming',
        'faas.coldstart': true,
        'sentry.kind': 'server',
      },
      op: 'function.aws',
      origin: 'auto.function.aws_serverless',
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

  test('callback-style handlers work', async ({ lambdaClient }) => {
    const transactionEventPromise = waitForTransaction('aws-serverless-layer', transactionEvent => {
      return transactionEvent?.transaction === 'LayerCallback';
    });

    await lambdaClient.send(
      new InvokeCommand({
        FunctionName: 'LayerCallback',
        Payload: JSON.stringify({}),
      }),
    );

    const transactionEvent = await transactionEventPromise;

    expect(transactionEvent.contexts?.trace).toEqual(
      expect.objectContaining({
        op: 'function.aws',
        origin: 'auto.function.aws_serverless',
        status: 'ok',
        data: expect.objectContaining({
          'sentry.op': 'function.aws',
          'sentry.origin': 'auto.function.aws_serverless',
          'sentry.kind': 'server',
          'cloud.resource_id': 'arn:aws:lambda:us-east-1:012345678912:function:LayerCallback',
          'faas.name': 'LayerCallback',
        }),
      }),
    );
  });

  test('callback-style handler errors are captured', async ({ lambdaClient }) => {
    const errorEventPromise = waitForError('aws-serverless-layer', errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'callback error';
    });

    await lambdaClient.send(
      new InvokeCommand({
        FunctionName: 'LayerCallback',
        Payload: JSON.stringify({ shouldError: true }),
      }),
    );

    const errorEvent = await errorEventPromise;

    expect(errorEvent.exception?.values?.[0]).toEqual(
      expect.objectContaining({
        type: 'Error',
        value: 'callback error',
        mechanism: {
          type: 'auto.function.aws_serverless.otel',
          handled: false,
        },
      }),
    );
  });

  test('ends the span when a callback-style handler calls back after it returned', async ({ lambdaClient }) => {
    const transactionEventPromise = waitForTransaction('aws-serverless-layer', transactionEvent => {
      return transactionEvent?.transaction === 'LayerCallback';
    });

    await lambdaClient.send(
      new InvokeCommand({
        FunctionName: 'LayerCallback',
        Payload: JSON.stringify({ callbackDelayMs: 200 }),
      }),
    );

    const transactionEvent = await transactionEventPromise;

    expect(transactionEvent.contexts?.trace?.status).toBe('ok');
    // Node timers can fire up to a millisecond early, so the 200 ms callback delay can measure as 199.x ms
    expect(transactionEvent.timestamp! - transactionEvent.start_timestamp!).toBeGreaterThanOrEqual(0.19);
  });

  test('sets error status when a callback-style handler calls back with an error after it returned', async ({
    lambdaClient,
  }) => {
    const errorEventPromise = waitForError('aws-serverless-layer', errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'callback error';
    });
    const transactionEventPromise = waitForTransaction('aws-serverless-layer', transactionEvent => {
      return transactionEvent?.transaction === 'LayerCallback';
    });

    await lambdaClient.send(
      new InvokeCommand({
        FunctionName: 'LayerCallback',
        Payload: JSON.stringify({ shouldError: true, callbackDelayMs: 200 }),
      }),
    );

    const [errorEvent, transactionEvent] = await Promise.all([errorEventPromise, transactionEventPromise]);

    expect(transactionEvent.contexts?.trace?.status).toBe('internal_error');
    expect(transactionEvent.timestamp! - transactionEvent.start_timestamp!).toBeGreaterThanOrEqual(0.19);
    expect(errorEvent.contexts?.trace?.trace_id).toBe(transactionEvent.contexts?.trace?.trace_id);
  });

  test('continues a trace from incoming headers', async ({ lambdaClient }) => {
    const traceId = 'd4cda95b652f4a1592b449d5929fda1b';
    const parentSpanId = '6e0c63257de34c92';

    const transactionEventPromise = waitForTransaction('aws-serverless-layer', transactionEvent => {
      return (
        transactionEvent?.transaction === 'LayerTracingCjs' && transactionEvent.contexts?.trace?.trace_id === traceId
      );
    });

    await lambdaClient.send(
      new InvokeCommand({
        FunctionName: 'LayerTracingCjs',
        Payload: JSON.stringify({
          headers: {
            'sentry-trace': `${traceId}-${parentSpanId}-1`,
            baggage: `sentry-environment=qa,sentry-public_key=public,sentry-trace_id=${traceId}`,
          },
        }),
      }),
    );

    const transactionEvent = await transactionEventPromise;

    // The Lambda transaction is parented to the incoming trace context (eventContextExtractor + startInactiveSpan).
    expect(transactionEvent.contexts?.trace?.trace_id).toEqual(traceId);
    expect(transactionEvent.contexts?.trace?.parent_span_id).toEqual(parentSpanId);
  });

  test('does not leak isolation scope data between invocations on a warm container', async ({ lambdaClient }) => {
    const firstErrorEventPromise = waitForError('aws-serverless-layer', errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'first invocation error';
    });
    const secondErrorEventPromise = waitForError('aws-serverless-layer', errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'second invocation error';
    });

    await lambdaClient.send(
      new InvokeCommand({
        FunctionName: 'LayerIsolationScope',
        Payload: JSON.stringify({ tag: 'first-invocation', errorMessage: 'first invocation error' }),
      }),
    );
    await lambdaClient.send(
      new InvokeCommand({
        FunctionName: 'LayerIsolationScope',
        Payload: JSON.stringify({ errorMessage: 'second invocation error' }),
      }),
    );

    const [firstErrorEvent, secondErrorEvent] = await Promise.all([firstErrorEventPromise, secondErrorEventPromise]);

    expect(firstErrorEvent.tags?.invocation_tag).toBe('first-invocation');
    expect(secondErrorEvent.tags?.invocation_tag).toBeUndefined();
  });

  test('sends events through the extension and http_proxy', async ({ lambdaClient }) => {
    const proxy = await startConnectProxy();

    try {
      const requestPromise = waitForRequest('aws-serverless-layer', requestData => {
        return requestData.rawProxyRequestBody.includes('http-proxy-test');
      });

      await lambdaClient.send(new InvokeCommand({ FunctionName: 'LayerHttpProxy', Payload: JSON.stringify({}) }));

      const request = await requestPromise;

      // The SDK only puts the DSN in the envelope header when it sends through a tunnel, i.e. the extension.
      const envelopeHeader = JSON.parse(request.rawProxyRequestBody.split('\n')[0] ?? '{}');
      expect(envelopeHeader.dsn).toEqual(expect.stringContaining(':3031/1337'));

      // The extension went through the proxy, and the SDK reached the extension without it.
      expect(proxy.connects.length).toBeGreaterThan(0);
      expect(proxy.connects.every(target => target.endsWith(':3031'))).toBe(true);
    } finally {
      await proxy.close();
    }
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
