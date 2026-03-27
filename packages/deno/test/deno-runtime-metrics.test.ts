// <reference lib="deno.ns" />

import { assertEquals, assertNotEquals } from 'https://deno.land/std@0.212.0/assert/mod.ts';
import { spy, stub } from 'https://deno.land/std@0.212.0/testing/mock.ts';
import { FakeTime } from 'https://deno.land/std@0.212.0/testing/time.ts';
import { denoRuntimeMetricsIntegration, metrics } from '../build/esm/index.js';

const MOCK_MEMORY: Deno.MemoryUsage = {
  rss: 50_000_000,
  heapTotal: 30_000_000,
  heapUsed: 20_000_000,
  external: 1_000_000,
};

// deno-lint-ignore no-explicit-any
type AnyCall = { args: any[] };

Deno.test('denoRuntimeMetricsIntegration has the correct name', () => {
  const integration = denoRuntimeMetricsIntegration();
  assertEquals(integration.name, 'DenoRuntimeMetrics');
});

Deno.test('starts a collection interval', () => {
  using time = new FakeTime();
  using _memStub = stub(Deno, 'memoryUsage', () => MOCK_MEMORY);
  const gaugeSpy = spy(metrics, 'gauge');

  try {
    const integration = denoRuntimeMetricsIntegration({ collectionIntervalMs: 1_000 });
    integration.setup!({} as never);

    assertEquals(gaugeSpy.calls.length, 0);
    time.tick(1_000);
    assertNotEquals(gaugeSpy.calls.length, 0);
  } finally {
    gaugeSpy.restore();
  }
});

Deno.test('emits default memory metrics', () => {
  using time = new FakeTime();
  using _memStub = stub(Deno, 'memoryUsage', () => MOCK_MEMORY);
  const gaugeSpy = spy(metrics, 'gauge');

  try {
    const integration = denoRuntimeMetricsIntegration({ collectionIntervalMs: 1_000 });
    integration.setup!({} as never);
    time.tick(1_000);

    const names = (gaugeSpy.calls as AnyCall[]).map(c => c.args[0]);
    assertEquals(names.includes('deno.runtime.mem.rss'), true);
    assertEquals(names.includes('deno.runtime.mem.heap_used'), true);
    assertEquals(names.includes('deno.runtime.mem.heap_total'), true);
  } finally {
    gaugeSpy.restore();
  }
});

Deno.test('emits correct memory values', () => {
  using time = new FakeTime();
  using _memStub = stub(Deno, 'memoryUsage', () => MOCK_MEMORY);
  const gaugeSpy = spy(metrics, 'gauge');

  try {
    const integration = denoRuntimeMetricsIntegration({ collectionIntervalMs: 1_000 });
    integration.setup!({} as never);
    time.tick(1_000);

    const calls = gaugeSpy.calls as AnyCall[];
    const rssCall = calls.find(c => c.args[0] === 'deno.runtime.mem.rss');
    const heapUsedCall = calls.find(c => c.args[0] === 'deno.runtime.mem.heap_used');
    const heapTotalCall = calls.find(c => c.args[0] === 'deno.runtime.mem.heap_total');

    assertEquals(rssCall?.args[1], 50_000_000);
    assertEquals(heapUsedCall?.args[1], 20_000_000);
    assertEquals(heapTotalCall?.args[1], 30_000_000);
  } finally {
    gaugeSpy.restore();
  }
});

Deno.test('does not emit mem.external by default', () => {
  using time = new FakeTime();
  using _memStub = stub(Deno, 'memoryUsage', () => MOCK_MEMORY);
  const gaugeSpy = spy(metrics, 'gauge');

  try {
    const integration = denoRuntimeMetricsIntegration({ collectionIntervalMs: 1_000 });
    integration.setup!({} as never);
    time.tick(1_000);

    const names = (gaugeSpy.calls as AnyCall[]).map(c => c.args[0]);
    assertEquals(names.includes('deno.runtime.mem.external'), false);
  } finally {
    gaugeSpy.restore();
  }
});

Deno.test('emits mem.external when opted in', () => {
  using time = new FakeTime();
  using _memStub = stub(Deno, 'memoryUsage', () => MOCK_MEMORY);
  const gaugeSpy = spy(metrics, 'gauge');

  try {
    const integration = denoRuntimeMetricsIntegration({
      collectionIntervalMs: 1_000,
      collect: { memExternal: true },
    });
    integration.setup!({} as never);
    time.tick(1_000);

    const calls = gaugeSpy.calls as AnyCall[];
    const externalCall = calls.find(c => c.args[0] === 'deno.runtime.mem.external');
    assertEquals(externalCall?.args[1], 1_000_000);
  } finally {
    gaugeSpy.restore();
  }
});

Deno.test('emits uptime counter', () => {
  using time = new FakeTime();
  using _memStub = stub(Deno, 'memoryUsage', () => MOCK_MEMORY);
  const countSpy = spy(metrics, 'count');

  try {
    const integration = denoRuntimeMetricsIntegration({ collectionIntervalMs: 1_000 });
    integration.setup!({} as never);
    time.tick(1_000);

    const uptimeCall = (countSpy.calls as AnyCall[]).find(c => c.args[0] === 'deno.runtime.process.uptime');
    assertNotEquals(uptimeCall, undefined);
  } finally {
    countSpy.restore();
  }
});

Deno.test('respects opt-out: skips mem.rss when memRss is false', () => {
  using time = new FakeTime();
  using _memStub = stub(Deno, 'memoryUsage', () => MOCK_MEMORY);
  const gaugeSpy = spy(metrics, 'gauge');

  try {
    const integration = denoRuntimeMetricsIntegration({
      collectionIntervalMs: 1_000,
      collect: { memRss: false },
    });
    integration.setup!({} as never);
    time.tick(1_000);

    const names = (gaugeSpy.calls as AnyCall[]).map(c => c.args[0]);
    assertEquals(names.includes('deno.runtime.mem.rss'), false);
  } finally {
    gaugeSpy.restore();
  }
});

Deno.test('skips uptime when uptime is false', () => {
  using time = new FakeTime();
  using _memStub = stub(Deno, 'memoryUsage', () => MOCK_MEMORY);
  const countSpy = spy(metrics, 'count');

  try {
    const integration = denoRuntimeMetricsIntegration({
      collectionIntervalMs: 1_000,
      collect: { uptime: false },
    });
    integration.setup!({} as never);
    time.tick(1_000);

    const uptimeCall = (countSpy.calls as AnyCall[]).find(c => c.args[0] === 'deno.runtime.process.uptime');
    assertEquals(uptimeCall, undefined);
  } finally {
    countSpy.restore();
  }
});

Deno.test('attaches correct sentry.origin attribute', () => {
  using time = new FakeTime();
  using _memStub = stub(Deno, 'memoryUsage', () => MOCK_MEMORY);
  const gaugeSpy = spy(metrics, 'gauge');

  try {
    const integration = denoRuntimeMetricsIntegration({ collectionIntervalMs: 1_000 });
    integration.setup!({} as never);
    time.tick(1_000);

    const calls = gaugeSpy.calls as AnyCall[];
    const rssCall = calls.find(c => c.args[0] === 'deno.runtime.mem.rss');
    assertEquals(rssCall?.args[2]?.attributes?.['sentry.origin'], 'auto.deno.runtime_metrics');
  } finally {
    gaugeSpy.restore();
  }
});
