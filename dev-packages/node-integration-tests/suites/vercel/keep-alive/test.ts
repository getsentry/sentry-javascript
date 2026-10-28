import { afterAll, describe, expect, test, vi } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

describe.each(['stream', 'static'] as const)('keeps the instance alive for telemetry (%s)', lifecycle => {
  const logExpectation = {
    log: {
      items: [expect.objectContaining({ body: 'keep alive log' })],
    },
  };

  const rootSpanExpectation =
    lifecycle === 'stream'
      ? {
          span: {
            items: expect.arrayContaining([
              expect.objectContaining({ name: 'keep-alive-child', is_segment: false }),
              expect.objectContaining({ is_segment: true }),
            ]),
          },
        }
      : {
          transaction: {
            contexts: { trace: { op: 'http.server' } },
            spans: [expect.objectContaining({ description: 'keep-alive-child' })],
          },
        };

  const metricExpectation = {
    trace_metric: {
      items: [expect.objectContaining({ name: 'keep_alive_metric', value: 1 })],
    },
  };

  test('sends the root span, log and metric before the instance freezes', async () => {
    const runner = createRunner(__dirname, 'scenario.ts')
      .withEnv({ VERCEL: '1', TRACE_LIFECYCLE: lifecycle })
      .unordered()
      .expect(rootSpanExpectation)
      .expect(logExpectation)
      .expect(metricExpectation)
      .start();

    await runner.completed();

    await vi.waitFor(() => expect(runner.getLogs().join('\n')).toContain('WAITUNTIL registered=1 late=0'));
  });

  test('sends the root span of a request that responds late', async () => {
    const runner = createRunner(__dirname, 'scenario.ts')
      .withEnv({ VERCEL: '1', TRACE_LIFECYCLE: lifecycle, TEST_CASE: 'slow' })
      .unordered()
      .expect(rootSpanExpectation)
      .expect(logExpectation)
      .expect(metricExpectation)
      .start();

    await runner.completed();

    await vi.waitFor(() => expect(runner.getLogs().join('\n')).toContain('WAITUNTIL registered=1 late=0'));
  });

  test('sends a root span that ends after the response closes', async () => {
    const runner = createRunner(__dirname, 'scenario.ts')
      .withEnv({ VERCEL: '1', TRACE_LIFECYCLE: lifecycle, TEST_CASE: 'late-root' })
      .unordered()
      .expect(rootSpanExpectation)
      .expect(logExpectation)
      .expect(metricExpectation)
      .start();

    await runner.completed();

    await vi.waitFor(() => expect(runner.getLogs().join('\n')).toContain('WAITUNTIL registered=1 late=0'));
  });

  test('sends errors and logs when tracing is disabled', async () => {
    const runner = createRunner(__dirname, 'scenario.ts')
      .withEnv({ VERCEL: '1', TRACE_LIFECYCLE: lifecycle, TEST_CASE: 'no-tracing' })
      .unordered()
      .expect({
        event: {
          exception: { values: [expect.objectContaining({ value: 'keep alive error' })] },
        },
      })
      .expect(logExpectation)
      .expect(metricExpectation)
      .start();

    await runner.completed();

    await vi.waitFor(() => expect(runner.getLogs().join('\n')).toContain('WAITUNTIL registered=1 late=0'));
  });

  test('sends logs for requests that get no server span', async () => {
    const runner = createRunner(__dirname, 'scenario.ts')
      .withEnv({ VERCEL: '1', TRACE_LIFECYCLE: lifecycle, TEST_CASE: 'head' })
      .unordered()
      .expect(logExpectation)
      .expect(metricExpectation)
      .start();

    await runner.completed();

    await vi.waitFor(() => expect(runner.getLogs().join('\n')).toContain('WAITUNTIL registered=1 late=0'));
  });
});
