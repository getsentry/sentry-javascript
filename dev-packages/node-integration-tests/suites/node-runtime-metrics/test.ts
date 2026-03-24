import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../utils/runner';

describe('nodeRuntimeMetricsIntegration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('emits default runtime metrics with correct shape', async () => {
    const metricShape = (name: string, type: 'gauge' | 'counter', unit?: string) => ({
      timestamp: expect.any(Number),
      trace_id: expect.any(String),
      name,
      type,
      ...(unit ? { unit } : {}),
      value: expect.any(Number),
      attributes: expect.objectContaining({
        'sentry.release': { value: '1.0.0', type: 'string' },
        'sentry.environment': { value: 'test', type: 'string' },
        'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
        'sentry.sdk.version': { value: expect.any(String), type: 'string' },
      }),
    });

    const runner = createRunner(__dirname, 'scenario.ts')
      .expect({
        trace_metric: {
          items: expect.arrayContaining([
            metricShape('node.runtime.mem.rss', 'gauge', 'byte'),
            metricShape('node.runtime.mem.heap_used', 'gauge', 'byte'),
            metricShape('node.runtime.mem.heap_total', 'gauge', 'byte'),
            metricShape('node.runtime.cpu.utilization', 'gauge'),
            metricShape('node.runtime.event_loop.delay.p50', 'gauge', 'second'),
            metricShape('node.runtime.event_loop.delay.p99', 'gauge', 'second'),
            metricShape('node.runtime.event_loop.utilization', 'gauge'),
            metricShape('node.runtime.process.uptime', 'counter', 'second'),
          ]),
        },
      })
      .start();

    await runner.completed();
  });

  test('does not emit opt-in metrics by default', async () => {
    const runner = createRunner(__dirname, 'scenario.ts')
      .expect({
        trace_metric: (container: { items: Array<{ name: string }> }) => {
          const names = container.items.map(item => item.name);
          expect(names).not.toContain('node.runtime.cpu.user');
          expect(names).not.toContain('node.runtime.cpu.system');
          expect(names).not.toContain('node.runtime.mem.external');
          expect(names).not.toContain('node.runtime.mem.array_buffers');
          expect(names).not.toContain('node.runtime.event_loop.delay.min');
          expect(names).not.toContain('node.runtime.event_loop.delay.max');
          expect(names).not.toContain('node.runtime.event_loop.delay.mean');
          expect(names).not.toContain('node.runtime.event_loop.delay.p90');
        },
      })
      .start();

    await runner.completed();
  });

  test('emits all metrics when fully opted in', async () => {
    const runner = createRunner(__dirname, 'scenario-all.ts')
      .expect({
        trace_metric: {
          items: expect.arrayContaining([
            expect.objectContaining({ name: 'node.runtime.mem.rss', type: 'gauge', unit: 'byte' }),
            expect.objectContaining({ name: 'node.runtime.mem.heap_used', type: 'gauge', unit: 'byte' }),
            expect.objectContaining({ name: 'node.runtime.mem.heap_total', type: 'gauge', unit: 'byte' }),
            expect.objectContaining({ name: 'node.runtime.mem.external', type: 'gauge', unit: 'byte' }),
            expect.objectContaining({ name: 'node.runtime.mem.array_buffers', type: 'gauge', unit: 'byte' }),
            expect.objectContaining({ name: 'node.runtime.cpu.user', type: 'gauge', unit: 'second' }),
            expect.objectContaining({ name: 'node.runtime.cpu.system', type: 'gauge', unit: 'second' }),
            expect.objectContaining({ name: 'node.runtime.cpu.utilization', type: 'gauge' }),
            expect.objectContaining({ name: 'node.runtime.event_loop.delay.min', type: 'gauge', unit: 'second' }),
            expect.objectContaining({ name: 'node.runtime.event_loop.delay.max', type: 'gauge', unit: 'second' }),
            expect.objectContaining({ name: 'node.runtime.event_loop.delay.mean', type: 'gauge', unit: 'second' }),
            expect.objectContaining({ name: 'node.runtime.event_loop.delay.p50', type: 'gauge', unit: 'second' }),
            expect.objectContaining({ name: 'node.runtime.event_loop.delay.p90', type: 'gauge', unit: 'second' }),
            expect.objectContaining({ name: 'node.runtime.event_loop.delay.p99', type: 'gauge', unit: 'second' }),
            expect.objectContaining({ name: 'node.runtime.event_loop.utilization', type: 'gauge' }),
            expect.objectContaining({ name: 'node.runtime.process.uptime', type: 'counter', unit: 'second' }),
          ]),
        },
      })
      .start();

    await runner.completed();
  });

  test('respects opt-out: only memory metrics remain when cpu/event loop/uptime are disabled', async () => {
    const runner = createRunner(__dirname, 'scenario-opt-out.ts')
      .expect({
        trace_metric: (container: { items: Array<{ name: string }> }) => {
          const names = container.items.map(item => item.name);

          // Memory metrics should still be present
          expect(names).toContain('node.runtime.mem.rss');
          expect(names).toContain('node.runtime.mem.heap_used');
          expect(names).toContain('node.runtime.mem.heap_total');

          // Everything else should be absent
          expect(names).not.toContain('node.runtime.cpu.utilization');
          expect(names).not.toContain('node.runtime.event_loop.delay.p50');
          expect(names).not.toContain('node.runtime.event_loop.delay.p99');
          expect(names).not.toContain('node.runtime.event_loop.utilization');
          expect(names).not.toContain('node.runtime.process.uptime');
        },
      })
      .start();

    await runner.completed();
  });
});
