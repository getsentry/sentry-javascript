import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../utils/runner';

const SENTRY_ATTRIBUTES = {
  'sentry.release': { value: '1.0.0', type: 'string' },
  'sentry.environment': { value: 'test', type: 'string' },
  'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
  'sentry.sdk.version': { value: expect.any(String), type: 'string' },
  'sentry.origin': { value: 'auto.bun.runtime_metrics', type: 'string' },
};

const gauge = (name: string, unit?: string) => ({
  timestamp: expect.any(Number),
  trace_id: expect.any(String),
  name,
  type: 'gauge',
  ...(unit ? { unit } : {}),
  value: expect.any(Number),
  attributes: expect.objectContaining(SENTRY_ATTRIBUTES),
});

const counter = (name: string, unit?: string) => ({
  timestamp: expect.any(Number),
  trace_id: expect.any(String),
  name,
  type: 'counter',
  ...(unit ? { unit } : {}),
  value: expect.any(Number),
  attributes: expect.objectContaining(SENTRY_ATTRIBUTES),
});

describe('bunRuntimeMetricsIntegration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('emits default runtime metrics with correct shape', async () => {
    const runner = createRunner(__dirname, 'scenario.ts')
      .expect({
        trace_metric: {
          items: expect.arrayContaining([
            gauge('bun.runtime.mem.rss', 'byte'),
            gauge('bun.runtime.mem.heap_used', 'byte'),
            gauge('bun.runtime.mem.heap_total', 'byte'),
            gauge('bun.runtime.cpu.utilization'),
            gauge('bun.runtime.event_loop.utilization'),
            counter('bun.runtime.process.uptime', 'second'),
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
          expect(names).not.toContain('bun.runtime.cpu.user');
          expect(names).not.toContain('bun.runtime.cpu.system');
          expect(names).not.toContain('bun.runtime.mem.external');
          expect(names).not.toContain('bun.runtime.mem.array_buffers');
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
            gauge('bun.runtime.mem.rss', 'byte'),
            gauge('bun.runtime.mem.heap_used', 'byte'),
            gauge('bun.runtime.mem.heap_total', 'byte'),
            gauge('bun.runtime.mem.external', 'byte'),
            gauge('bun.runtime.mem.array_buffers', 'byte'),
            gauge('bun.runtime.cpu.user', 'second'),
            gauge('bun.runtime.cpu.system', 'second'),
            gauge('bun.runtime.cpu.utilization'),
            gauge('bun.runtime.event_loop.utilization'),
            counter('bun.runtime.process.uptime', 'second'),
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
          expect(names).toContain('bun.runtime.mem.rss');
          expect(names).toContain('bun.runtime.mem.heap_used');
          expect(names).toContain('bun.runtime.mem.heap_total');

          // Everything else should be absent
          expect(names).not.toContain('bun.runtime.cpu.utilization');
          expect(names).not.toContain('bun.runtime.event_loop.utilization');
          expect(names).not.toContain('bun.runtime.process.uptime');
        },
      })
      .start();

    await runner.completed();
  });
});
