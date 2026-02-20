import * as fs from 'fs';
import * as path from 'path';
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

// Directory for heap snapshots (will be uploaded as artifacts in CI)
const HEAP_SNAPSHOTS_DIR = path.join(process.cwd(), 'heap-snapshots');

// Set to true to save heap snapshots for debugging (slow, especially on CI)
const SAVE_HEAP_SNAPSHOTS = process.env.SAVE_HEAP_SNAPSHOTS === 'true';

/**
 * Save a heap snapshot to disk for later analysis.
 * Files can be loaded into Chrome DevTools Memory tab.
 * This is slow and optional - controlled by SAVE_HEAP_SNAPSHOTS env var.
 */
async function saveHeapSnapshot(profiler: MemoryProfiler, filename: string): Promise<void> {
  if (!SAVE_HEAP_SNAPSHOTS) {
    return;
  }

  if (!fs.existsSync(HEAP_SNAPSHOTS_DIR)) {
    fs.mkdirSync(HEAP_SNAPSHOTS_DIR, { recursive: true });
  }

  try {
    const snapshot = await profiler.takeHeapSnapshot();
    const filepath = path.join(HEAP_SNAPSHOTS_DIR, filename);
    fs.writeFileSync(filepath, snapshot);
    // eslint-disable-next-line no-console
    console.log(`Heap snapshot saved to: ${filepath} (${(snapshot.length / 1024 / 1024).toFixed(2)} MB)`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`Failed to save heap snapshot ${filename}:`, err);
  }
}

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
  // Memory profiling can be slow, especially on CI - increase timeout to 3 minutes
  test.setTimeout(180_000);

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

    // eslint-disable-next-line no-console
    console.log(`Memory growth: ${result.growthKB.toFixed(2)} KB`);
    // eslint-disable-next-line no-console
    console.log(`Baseline: ${(result.baseline.usedSize / 1024).toFixed(2)} KB`);
    // eslint-disable-next-line no-console
    console.log(`Final: ${(result.final.usedSize / 1024).toFixed(2)} KB`);

    // CI environments (GitHub Actions) show ~300KB higher memory usage than local
    // and have ~100KB variance between runs. Threshold set to accommodate this
    // while still catching real memory leaks.
    expect(result.growthKB).toBeLessThan(1500);

    // Save heap snapshots after assertion for debugging failed tests
    // Controlled by SAVE_HEAP_SNAPSHOTS=true env var
    await saveHeapSnapshot(profiler, 'final.heapsnapshot');

    await profiler.close();
  });
});
