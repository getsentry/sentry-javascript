import { MemoryProfiler } from '@sentry-internal/test-utils';
import { expect, test } from '@playwright/test';
import { INSPECTOR_PORT } from '../playwright.config';

test.describe('Worker V8 isolate memory tests', () => {
  test('worker memory is reclaimed after GC', async ({ baseURL }) => {
    const profiler = new MemoryProfiler({ port: INSPECTOR_PORT });

    // Warm up: make initial requests and let the runtime settle
    for (let i = 0; i < 5; i++) {
      await fetch(baseURL!);
    }

    await profiler.connect();

    const baselineSnapshot = await profiler.takeHeapSnapshot();

    for (let i = 0; i < 50; i++) {
      const res = await fetch(baseURL!);
      expect(res.status).toBe(200);
      await res.text();
    }

    const finalSnapshot = await profiler.takeHeapSnapshot();
    const result = profiler.compareSnapshots(baselineSnapshot, finalSnapshot);

    expect(result.nodeGrowthPercent).toBeLessThan(1);

    await profiler.close();
  });
});
