import { InvokeCommand } from '@aws-sdk/client-lambda';
import type { LambdaClient } from '@aws-sdk/client-lambda';
import { waitForError } from '@sentry-internal/test-utils';
import { createServer } from 'node:http';
import { getTunnelPath } from '@sentry/aws-serverless';
import { getHostIp } from '../src/stack';
import { expect, test } from './lambda-fixtures';

/**
 * The headers of Sentry's answer the Node tunnel passes on, see `FORWARDED_RESPONSE_HEADERS` in `@sentry/core`.
 */
const FORWARDED_RESPONSE_HEADERS = ['content-type', 'retry-after', 'x-sentry-rate-limits'];

interface InvokeResult {
  functionError?: string;
  payload: string;
}

async function invoke(lambdaClient: LambdaClient, functionName: string, event: unknown): Promise<InvokeResult> {
  const result = await lambdaClient.send(
    new InvokeCommand({ FunctionName: functionName, Payload: JSON.stringify(event) }),
  );

  return { functionError: result.FunctionError, payload: Buffer.from(result.Payload ?? []).toString('utf8') };
}

async function getDsn(port = 3031): Promise<string> {
  return `http://public@${await getHostIp()}:${port}/1337`;
}

function makeEnvelope(dsn: string, marker: string): string {
  const eventId = crypto.randomUUID().replace(/-/g, '');

  return [
    JSON.stringify({ dsn, event_id: eventId, sent_at: new Date().toISOString() }),
    JSON.stringify({ type: 'event' }),
    JSON.stringify({ event_id: eventId, message: marker, level: 'info' }),
  ].join('\n');
}

type EventShape = 'apiGatewayV2' | 'apiGatewayV1' | 'alb';

/**
 * The event API Gateway (HTTP API or function URL, and REST), or an ALB, hands the handler for a browser POSTing an
 * envelope to the tunnel.
 */
function makeHttpEvent(shape: EventShape, path: string, envelope: string, base64 = false): Record<string, unknown> {
  const body = base64 ? Buffer.from(envelope).toString('base64') : envelope;
  const contentType = 'application/x-sentry-envelope';

  if (shape === 'apiGatewayV2') {
    return {
      version: '2.0',
      rawPath: path,
      rawQueryString: '',
      headers: { 'content-type': contentType },
      requestContext: { http: { method: 'POST' } },
      body,
      isBase64Encoded: base64,
    };
  }

  if (shape === 'apiGatewayV1') {
    return { httpMethod: 'POST', path, headers: { 'content-type': contentType }, body, isBase64Encoded: base64 };
  }

  return {
    httpMethod: 'POST',
    path,
    multiValueHeaders: { 'content-type': [contentType] },
    requestContext: { elb: { targetGroupArn: 'arn:aws:elasticloadbalancing:us-east-1:012345678912:targetgroup/t' } },
    body,
    isBase64Encoded: base64,
  };
}

test.describe('managed tunnel', () => {
  for (const functionName of ['NpmTunnelAsync', 'NpmTunnelNodeAsync', 'NpmTunnelNodeCallback']) {
    test(`${functionName} answers tunnel requests before the handler`, async ({ lambdaClient }) => {
      const dsn = await getDsn();
      const marker = `${functionName}-${crypto.randomUUID()}`;
      const forwarded = waitForError('aws-serverless', event => event.message === marker);

      const result = await invoke(
        lambdaClient,
        functionName,
        makeHttpEvent('apiGatewayV2', getTunnelPath(dsn)!, makeEnvelope(dsn, marker)),
      );

      expect(result.functionError).toBeUndefined();
      expect(JSON.parse(result.payload)).toMatchObject({ statusCode: 200, isBase64Encoded: false });
      expect(JSON.parse(result.payload).body).not.toBe('app');
      await forwarded;
    });

    test(`${functionName} passes other events to the handler`, async ({ lambdaClient }) => {
      const result = await invoke(
        lambdaClient,
        functionName,
        makeHttpEvent('apiGatewayV2', '/other', 'not an envelope'),
      );

      expect(JSON.parse(result.payload)).toEqual({ statusCode: 200, body: 'app' });
    });
  }

  for (const [shape, base64] of [
    ['apiGatewayV1', false],
    ['alb', false],
    ['apiGatewayV2', true],
  ] as const) {
    test(`reads ${base64 ? 'a base64 body from ' : ''}an ${shape} event`, async ({ lambdaClient }) => {
      const dsn = await getDsn();
      const marker = `${shape}-${base64}-${crypto.randomUUID()}`;
      const forwarded = waitForError('aws-serverless', event => event.message === marker);

      const result = await invoke(
        lambdaClient,
        'NpmTunnelAsync',
        makeHttpEvent(shape, getTunnelPath(dsn)!, makeEnvelope(dsn, marker), base64),
      );

      const response = JSON.parse(result.payload);
      expect(response.statusCode).toBe(200);
      // An ALB event with multi-value headers needs multi-value headers back.
      expect(response).toHaveProperty(shape === 'alb' ? 'multiValueHeaders' : 'headers');
      // Only the headers the browser SDK reads, like the Node answer, not the ones about the connection to Sentry.
      const headerNames = Object.keys(response.headers ?? response.multiValueHeaders);
      expect(headerNames.filter(name => !FORWARDED_RESPONSE_HEADERS.includes(name))).toEqual([]);
      await forwarded;
    });
  }

  for (const functionName of ['NpmTunnelStreaming', 'NpmTunnelNodeStreaming']) {
    test(`${functionName} streams the tunnel answer before the handler`, async ({ lambdaClient }) => {
      const dsn = await getDsn();
      const marker = `${functionName}-${crypto.randomUUID()}`;
      const forwarded = waitForError('aws-serverless', event => event.message === marker);

      const result = await invoke(
        lambdaClient,
        functionName,
        makeHttpEvent('apiGatewayV2', getTunnelPath(dsn)!, makeEnvelope(dsn, marker)),
      );

      expect(result.functionError).toBeUndefined();
      expect(result.payload).not.toContain('app');
      await forwarded;
    });
  }

  test('ends the stream with the error answer when forwarding a tunnel request fails', async ({ lambdaClient }) => {
    // The function's DSN points at a port nothing listens on.
    const dsn = await getDsn(3032);
    const startedAt = Date.now();

    const result = await invoke(
      lambdaClient,
      'NpmTunnelNodeStreamingUnreachable',
      makeHttpEvent('apiGatewayV2', getTunnelPath(dsn)!, makeEnvelope(dsn, 'unreachable')),
    );

    // An unended stream would hold the invocation until the 10s function timeout.
    expect(result.functionError).toBeUndefined();
    expect(Date.now() - startedAt).toBeLessThan(8_000);
    expect(result.payload).toBe('Failed to forward envelope to Sentry');
  });

  test('ends the stream with an error answer when the answer from Sentry breaks off', async ({ lambdaClient }) => {
    // Answers 200, then drops the connection before the body is complete.
    const ingest = createServer((req, res) => {
      req.resume();
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json', 'content-length': '100' });
        res.write('{"id":');
        setTimeout(() => res.socket?.destroy(), 50);
      });
    }).listen(3033, '0.0.0.0');

    try {
      const dsn = await getDsn(3033);
      const startedAt = Date.now();

      const result = await invoke(
        lambdaClient,
        'NpmTunnelNodeStreamingBrokenAnswer',
        makeHttpEvent('apiGatewayV2', getTunnelPath(dsn)!, makeEnvelope(dsn, 'broken-answer')),
      );

      // An unended stream would hold the invocation until the 10s function timeout.
      expect(result.functionError).toBeUndefined();
      expect(Date.now() - startedAt).toBeLessThan(8_000);
      expect(result.payload).not.toContain('app');
    } finally {
      ingest.close();
    }
  });
});
