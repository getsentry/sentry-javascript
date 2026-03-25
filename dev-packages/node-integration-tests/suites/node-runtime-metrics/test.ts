import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../utils/runner';

const SENTRY_ATTRIBUTES = {
  'sentry.release': { value: '1.0.0', type: 'string' },
  'sentry.environment': { value: 'test', type: 'string' },
  'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
  'sentry.sdk.version': { value: expect.any(String), type: 'string' },
  'sentry.origin': { value: 'auto.node.runtime_metrics', type: 'string' },
};

const gauge = (name: string, unit?: string) => ({
  timestamp: expect.any(Number),
  trace_id: expect.any(String),
  name,
  type: 'gauge',
  ...(unit ? { unit } : {}),
  value: expect.any(Number),
  attributes: SENTRY_ATTRIBUTES,
});

const counter = (name: string, unit?: string) => ({
  timestamp: expect.any(Number),
  trace_id: expect.any(String),
  name,
  type: 'counter',
  ...(unit ? { unit } : {}),
  value: expect.any(Number),
  attributes: SENTRY_ATTRIBUTES,
});

describe('nodeRuntimeMetricsIntegration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('emits default runtime metrics with correct shape', async () => {
    const runner = createRunner(__dirname, 'scenario.ts')
      .expect({
        trace_metric: {
          items: expect.arrayContaining([
            gauge('node.runtime.mem.rss', 'byte'),
            gauge('node.runtime.mem.heap_used', 'byte'),
            gauge('node.runtime.mem.heap_total', 'byte'),
            gauge('node.runtime.cpu.utilization'),
            gauge('node.runtime.event_loop.delay.p50', 'second'),
            gauge('node.runtime.event_loop.delay.p99', 'second'),
            gauge('node.runtime.event_loop.utilization'),
            counter('node.runtime.process.uptime', 'second'),
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
            gauge('node.runtime.mem.rss', 'byte'),
            gauge('node.runtime.mem.heap_used', 'byte'),
            gauge('node.runtime.mem.heap_total', 'byte'),
            gauge('node.runtime.mem.external', 'byte'),
            gauge('node.runtime.mem.array_buffers', 'byte'),
            gauge('node.runtime.cpu.user', 'second'),
            gauge('node.runtime.cpu.system', 'second'),
            gauge('node.runtime.cpu.utilization'),
            gauge('node.runtime.event_loop.delay.min', 'second'),
            gauge('node.runtime.event_loop.delay.max', 'second'),
            gauge('node.runtime.event_loop.delay.mean', 'second'),
            gauge('node.runtime.event_loop.delay.p50', 'second'),
            gauge('node.runtime.event_loop.delay.p90', 'second'),
            gauge('node.runtime.event_loop.delay.p99', 'second'),
            gauge('node.runtime.event_loop.utilization'),
            counter('node.runtime.process.uptime', 'second'),
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
