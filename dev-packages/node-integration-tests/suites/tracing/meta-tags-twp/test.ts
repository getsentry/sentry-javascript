import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

describe('getTraceMetaTags', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('injects sentry tracing <meta> tags without sampled flag for Tracing Without Performance', async () => {
    const runner = createRunner(__dirname, 'server.js').start();

    const response = await runner.makeRequest('get', '/test');

    // @ts-ignore - response is defined, types just don't reflect it
    const html = response?.response as unknown as string;

    const [, traceId, spanId] = html.match(/<meta name="sentry-trace" content="([a-f\d]{32})-([a-f\d]{16})"\/>/) || [
      undefined,
      undefined,
      undefined,
    ];

    expect(traceId).toBeDefined();
    expect(spanId).toBeDefined();

    const sentryBaggageContent = html.match(/<meta name="baggage" content="(.*)"\/>/)?.[1];

    expect(sentryBaggageContent).toContain('sentry-environment=production');
    expect(sentryBaggageContent).toContain('sentry-public_key=public');
    expect(sentryBaggageContent).toContain(`sentry-trace_id=${traceId}`);
    expect(sentryBaggageContent).not.toContain('sentry-sampled=');
  });
});
