import { MemoryProfiler } from '@sentry-internal/test-utils';
import { expect, test } from '@playwright/test';
import { INSPECTOR_PORT } from '../playwright.config';

test.describe('Worker V8 isolate memory tests', () => {
  test('worker memory is stable across request batches', async ({ baseURL }) => {
    const profiler = new MemoryProfiler({ port: INSPECTOR_PORT });

    // Warm up: make initial requests and let the runtime settle
    for (let i = 0; i < 20; i++) {
      await fetch(baseURL!);
    }

    await profiler.connect();

    // First batch
    for (let i = 0; i < 50; i++) {
      const res = await fetch(baseURL!);
      expect(res.status).toBe(200);
      await res.text();
    }

    const afterFirstBatch = await profiler.takeHeapSnapshot();

    // Second batch
    for (let i = 0; i < 50; i++) {
      const res = await fetch(baseURL!);
      expect(res.status).toBe(200);
      await res.text();
    }

    const afterSecondBatch = await profiler.takeHeapSnapshot();

    // Compare batches to detect per-request leaks (excludes warm-up effects)
    const result = profiler.compareSnapshots(afterFirstBatch, afterSecondBatch);

    expect(result.nodeGrowthPercent).toBeLessThan(0.15);

    await profiler.close();
  });

  test('durable object memory is stable across request batches', async ({ baseURL }) => {
    const profiler = new MemoryProfiler({ port: INSPECTOR_PORT });

    // Warm up: let JIT compile, caches fill, and DO instance stabilize
    for (let i = 0; i < 30; i++) {
      await fetch(`${baseURL}/pass-to-object/storage/put`);
    }

    await profiler.connect();

    // First batch of requests to the same DO
    for (let i = 0; i < 50; i++) {
      const res = await fetch(`${baseURL}/pass-to-object/storage/put`);
      expect(res.status).toBe(200);
      await res.text();
    }

    const afterFirstBatch = await profiler.takeHeapSnapshot();

    // Second batch of requests to the same DO
    for (let i = 0; i < 50; i++) {
      const res = await fetch(`${baseURL}/pass-to-object/storage/put`);
      expect(res.status).toBe(200);
      await res.text();
    }

    const afterSecondBatch = await profiler.takeHeapSnapshot();

    // Compare batches to detect per-request leaks (excludes warm-up effects)
    // Before fix: makeFlushLock re-wrapped waitUntil on each request = leak
    // After fix: growth should be minimal
    const result = profiler.compareSnapshots(afterFirstBatch, afterSecondBatch);

    expect(result.nodeGrowthPercent).toBeLessThan(0.15);

    await profiler.close();
  });
});
