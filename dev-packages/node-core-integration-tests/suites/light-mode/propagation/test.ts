import crypto from 'crypto';
import { afterAll, expect, test } from 'vitest';
import { conditionalTest } from '../../../utils';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

conditionalTest({ min: 22 })('light mode propagation', () => {
  test('getTraceData returns consistent span ID within a request', async () => {
    const runner = createRunner(__dirname, 'server.js').start();

    const response = await runner.makeRequest<{ spanId1: string; spanId2: string }>('get', '/test-propagation');

    expect(response?.spanId1).toBeDefined();
    expect(response?.spanId2).toBeDefined();
    expect(response?.spanId1).toBe(response?.spanId2);
  });

  test('continues trace from incoming sentry-trace and baggage headers', async () => {
    const traceId = crypto.randomUUID().replace(/-/g, '');
    const parentSpanId = traceId.substring(0, 16);

    const runner = createRunner(__dirname, 'server.js')
      .expect({
        event: event => {
          expect(event.contexts?.trace?.trace_id).toBe(traceId);
          expect(event.contexts?.trace?.parent_span_id).toBe(parentSpanId);
        },
      })
      .start();

    await runner.makeRequest('get', '/test-trace-continuation', {
      headers: {
        'sentry-trace': `${traceId}-${parentSpanId}-1`,
        baggage: `sentry-trace_id=${traceId},sentry-environment=test,sentry-public_key=public`,
      },
    });

    await runner.completed();
  });

  test('propagates trace via getTraceData to outgoing http requests', async () => {
    const traceId = crypto.randomUUID().replace(/-/g, '');
    const parentSpanId = traceId.substring(0, 16);

    const runner = createRunner(__dirname, 'server.js').start();

    const response = await runner.makeRequest<{ 'sentry-trace': string; baggage: string }>(
      'get',
      '/test-outgoing-http',
      {
        headers: {
          'sentry-trace': `${traceId}-${parentSpanId}-1`,
          baggage: `sentry-trace_id=${traceId},sentry-environment=test,sentry-public_key=public`,
        },
      },
    );

    // Outgoing request should carry the same trace ID with a new span ID
    expect(response?.['sentry-trace']).toMatch(new RegExp(`^${traceId}-[a-f\\d]{16}-1$`));
    const outgoingSpanId = response?.['sentry-trace']?.split('-')[1];
    expect(outgoingSpanId).not.toBe(parentSpanId);
    expect(response?.baggage).toContain(`sentry-trace_id=${traceId}`);
  });

  test('propagates trace via getTraceData to outgoing fetch requests', async () => {
    const traceId = crypto.randomUUID().replace(/-/g, '');
    const parentSpanId = traceId.substring(0, 16);

    const runner = createRunner(__dirname, 'server.js').start();

    const response = await runner.makeRequest<{ 'sentry-trace': string; baggage: string }>(
      'get',
      '/test-outgoing-fetch',
      {
        headers: {
          'sentry-trace': `${traceId}-${parentSpanId}-1`,
          baggage: `sentry-trace_id=${traceId},sentry-environment=test,sentry-public_key=public`,
        },
      },
    );

    // Outgoing request should carry the same trace ID with a new span ID
    expect(response?.['sentry-trace']).toMatch(new RegExp(`^${traceId}-[a-f\\d]{16}-1$`));
    const outgoingSpanId = response?.['sentry-trace']?.split('-')[1];
    expect(outgoingSpanId).not.toBe(parentSpanId);
    expect(response?.baggage).toContain(`sentry-trace_id=${traceId}`);
  });
});
