import http from 'http';
import type { AddressInfo } from 'net';
import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpan } from '../../../../utils/spanUtils';

sentryTest(
  'creates an http.client.stream sibling span when fetchStreamPerformanceIntegration is used',
  async ({ getLocalTestUrl, page }) => {
    sentryTest.skip(shouldSkipTracingTest());

    // Real server that responds with SSE headers and no content-length.
    // Playwright's route.fulfill always adds content-length, so we proxy through
    // a real server to get authentic streaming response headers.
    const server = await new Promise<http.Server>(resolve => {
      const s = http.createServer((req, res) => {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        });
        res.end('data: ok\n\n');
      });
      s.listen(0, () => resolve(s));
    });

    const port = (server.address() as AddressInfo).port;

    try {
      await page.route('http://sentry-test-site.example/*', async route => {
        const response = await route.fetch({ url: `http://localhost:${port}/sse` });
        await route.fulfill({ response });
      });

      const url = await getLocalTestUrl({ testDir: __dirname });

      // Wait for each span type separately since they may arrive in different envelopes
      const httpSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'http.client');
      const streamSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'http.client.stream');

      await page.goto(url);

      const [requestSpan, streamSpan] = await Promise.all([httpSpanPromise, streamSpanPromise]);

      expect(requestSpan).toMatchObject({
        name: 'GET http://sentry-test-site.example/delayed',
        status: 'ok',
      });

      expect(streamSpan).toMatchObject({
        name: 'GET http://sentry-test-site.example/delayed',
        attributes: expect.objectContaining({
          'http.method': { type: 'string', value: 'GET' },
          url: { type: 'string', value: 'http://sentry-test-site.example/delayed' },
          type: { type: 'string', value: 'fetch' },
        }),
      });

      expect(streamSpan.end_timestamp).toBeGreaterThan(streamSpan.start_timestamp);
    } finally {
      server.close();
    }
  },
);
