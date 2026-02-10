import crypto from 'crypto';
import { afterAll, expect, test } from 'vitest';
import { conditionalTest } from '../../../utils';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

conditionalTest({ min: 22 })('light mode outgoing http', () => {
  test('automatically propagates trace headers to outgoing http requests matching tracePropagationTargets', async () => {
    const traceId = crypto.randomUUID().replace(/-/g, '');
    const parentSpanId = traceId.substring(0, 16);

    const runner = createRunner(__dirname, 'server.js').start();

    const response = await runner.makeRequest<Record<string, { 'sentry-trace'?: string; baggage?: string }>>(
      'get',
      '/test-auto-propagation',
      {
        headers: {
          'sentry-trace': `${traceId}-${parentSpanId}-1`,
          baggage: `sentry-trace_id=${traceId},sentry-environment=test,sentry-public_key=public`,
        },
      },
    );

    // /api/v0 matches tracePropagationTargets - should have headers
    expect(response?.['/api/v0']?.['sentry-trace']).toMatch(new RegExp(`^${traceId}-[a-f\\d]{16}-1$`));
    expect(response?.['/api/v0']?.baggage).toContain(`sentry-trace_id=${traceId}`);

    // /api/v1 matches tracePropagationTargets - should have headers
    expect(response?.['/api/v1']?.['sentry-trace']).toMatch(new RegExp(`^${traceId}-[a-f\\d]{16}-1$`));
    expect(response?.['/api/v1']?.baggage).toContain(`sentry-trace_id=${traceId}`);

    // /api/v2 does NOT match tracePropagationTargets - should NOT have headers
    expect(response?.['/api/v2']?.['sentry-trace']).toBeUndefined();
    expect(response?.['/api/v2']?.baggage).toBeUndefined();
  });

  test('creates breadcrumbs for outgoing http requests', async () => {
    const runner = createRunner(__dirname, 'server.js')
      .expect({
        event: event => {
          const breadcrumbs = event.breadcrumbs || [];
          const httpBreadcrumbs = breadcrumbs.filter(b => b.category === 'http');

          expect(httpBreadcrumbs.length).toBe(2);

          expect(httpBreadcrumbs[0]).toEqual(
            expect.objectContaining({
              category: 'http',
              type: 'http',
              data: expect.objectContaining({
                'http.method': 'GET',
                status_code: 200,
              }),
            }),
          );

          expect(httpBreadcrumbs[1]).toEqual(
            expect.objectContaining({
              category: 'http',
              type: 'http',
              data: expect.objectContaining({
                'http.method': 'GET',
                status_code: 200,
              }),
            }),
          );
        },
      })
      .start();

    await runner.makeRequest('get', '/test-breadcrumbs');

    await runner.completed();
  });
});
