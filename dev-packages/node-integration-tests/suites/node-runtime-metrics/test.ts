import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../utils/runner';

describe('nodeRuntimeMetricsIntegration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('emits runtime metrics', async () => {
    const runner = createRunner(__dirname, 'scenario.ts')
      .expect({
        trace_metric: {
          items: expect.arrayContaining([
            expect.objectContaining({ name: 'node.runtime.mem.rss', type: 'gauge', unit: 'byte' }),
            expect.objectContaining({ name: 'node.runtime.mem.heap_total', type: 'gauge', unit: 'byte' }),
            expect.objectContaining({ name: 'node.runtime.mem.heap_used', type: 'gauge', unit: 'byte' }),
            expect.objectContaining({ name: 'node.runtime.mem.external', type: 'gauge', unit: 'byte' }),
            expect.objectContaining({ name: 'node.runtime.cpu.user', type: 'gauge', unit: 'second' }),
            expect.objectContaining({ name: 'node.runtime.cpu.system', type: 'gauge', unit: 'second' }),
            expect.objectContaining({ name: 'node.runtime.cpu.percent', type: 'gauge', unit: '1' }),
            expect.objectContaining({ name: 'node.runtime.event_loop.delay.min', type: 'gauge', unit: 'second' }),
            expect.objectContaining({ name: 'node.runtime.event_loop.delay.max', type: 'gauge', unit: 'second' }),
            expect.objectContaining({ name: 'node.runtime.event_loop.delay.mean', type: 'gauge', unit: 'second' }),
            expect.objectContaining({ name: 'node.runtime.event_loop.delay.p50', type: 'gauge', unit: 'second' }),
            expect.objectContaining({ name: 'node.runtime.event_loop.delay.p90', type: 'gauge', unit: 'second' }),
            expect.objectContaining({ name: 'node.runtime.event_loop.delay.p99', type: 'gauge', unit: 'second' }),
            expect.objectContaining({ name: 'node.runtime.event_loop.utilization', type: 'gauge', unit: '1' }),
            expect.objectContaining({ name: 'node.runtime.process.uptime', type: 'counter', unit: 'second' }),
          ]),
        },
      })
      .start();

    await runner.completed();
  });

  test('respects opt-out options', async () => {
    const runner = createRunner(__dirname, 'scenario-opt-out.ts')
      .expect({
        trace_metric: {
          items: expect.arrayContaining([expect.objectContaining({ name: 'node.runtime.mem.rss', type: 'gauge' })]),
        },
      })
      .start();

    await runner.completed();
  });
});
