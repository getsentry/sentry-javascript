import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

describe('getTraceMetaTags', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('injects <meta> tags with trace from incoming headers', async () => {
    const traceId = 'cd7ee7a6fe3ebe7ab9c3271559bc203c';
    const parentSpanId = '100ff0980e7a4ead';

    const runner = createRunner(__dirname, 'server.js').start();

    const response = await runner.makeRequest<{ response: string }>('get', '/test', {
      headers: {
        'sentry-trace': `${traceId}-${parentSpanId}-1`,
        baggage: 'sentry-environment=production,sentry-sample_rand=0.42',
      },
    });

    const html = response?.response;

    expect(html).toMatch(/<meta name="sentry-trace" content="cd7ee7a6fe3ebe7ab9c3271559bc203c-[a-z\d]{16}-1"\/>/);
    expect(html).toContain('<meta name="baggage" content="sentry-environment=production,sentry-sample_rand=0.42"/>');
  });

  test('injects <meta> tags with new trace if no incoming headers', async () => {
    const runner = createRunner(__dirname, 'server.js').start();

    const response = await runner.makeRequest<{ response: string }>('get', '/test');

    const html = response?.response;

    const traceId = html?.match(/<meta name="sentry-trace" content="([a-z\d]{32})-[a-z\d]{16}"\/>/)?.[1];
    expect(traceId).not.toBeUndefined();

    expect(html).toContain('<meta name="baggage"');
    expect(html).toContain(`sentry-trace_id=${traceId}`);

    // in node-core, we don't create spans for http requests so
    // there's no sampling decision like in tracing-without-performance
    expect(html).not.toContain('sentry-sampled=');
  });

  test("doesn't inject sentry tracing <meta> tags if SDK is disabled", async () => {
    const traceId = 'cd7ee7a6fe3ebe7ab9c3271559bc203c';
    const parentSpanId = '100ff0980e7a4ead';

    const runner = createRunner(__dirname, 'server-sdk-disabled.js').start();

    const response = await runner.makeRequest<{ response: string }>('get', '/test', {
      headers: {
        'sentry-trace': `${traceId}-${parentSpanId}-1`,
        baggage: 'sentry-environment=production',
      },
    });

    const html = response?.response;

    expect(html).not.toContain('"sentry-trace"');
    expect(html).not.toContain('"baggage"');
  });
});
