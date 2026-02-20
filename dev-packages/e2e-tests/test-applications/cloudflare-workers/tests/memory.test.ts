import { MemoryProfiler } from '@sentry-internal/test-utils';
import { expect, test } from '@playwright/test';

/**
 * Memory leak tests for Cloudflare Workers SDK.
 *
 * These tests verify that the CloudflareClient.dispose() mechanism properly
 * cleans up resources to prevent memory leaks.
 *
 * The test connects directly to the wrangler dev server's V8 inspector via CDP
 * (Chrome DevTools Protocol) on ws://127.0.0.1:9230/ws to take heap snapshots
 * of the actual worker isolate.
 *
 * @see https://developers.cloudflare.com/workers/observability/dev-tools/memory-usage/
 */

// Wrangler dev exposes inspector on this port (configured in playwright.config.ts)
const INSPECTOR_PORT = 9230;

/**
 * CDP-based heap snapshot test for Cloudflare Workers.
 *
 * This test connects directly to the wrangler dev inspector at ws://127.0.0.1:9230/ws
 * to profile the actual worker's V8 isolate memory, not a browser.
 *
 * The wrangler dev server must be running with --inspector-port 9230.
 * This is configured in playwright.config.ts.
 */
test.describe('Worker V8 isolate memory tests', () => {
  test('worker memory is reclaimed after GC', async ({ baseURL }) => {
    const profiler = new MemoryProfiler({ port: INSPECTOR_PORT, debug: true });

    await profiler.connect();
    await profiler.startProfiling();

    const numRequests = 50;

    for (let i = 0; i < numRequests; i++) {
      const res = await fetch(baseURL!);
      expect(res.status).toBe(200);
      await res.text();
    }

    const result = await profiler.stopProfiling();

    expect(result.growthKB).toBeLessThan(800);

    await profiler.close();
  });
});
