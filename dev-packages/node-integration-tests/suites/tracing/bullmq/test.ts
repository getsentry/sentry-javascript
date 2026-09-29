import type { SerializedMetricContainer } from '@sentry/core';
import { afterAll, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests, describeWithDockerCompose } from '../../../utils/runner';

describeWithDockerCompose('bullmq', { workingDirectory: [__dirname] }, () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('traces producer and consumer operations with queue attributes', { timeout: 90_000 }, async () => {
      await createRunner()
        .ignore('trace_metric')
        .expect({
          span: container => {
            const producerSegment = container.items.find(item => item.is_segment && item.name === 'enqueue test-job');
            const producerSpan = container.items.find(
              item => item.attributes['sentry.origin']?.value === 'auto.queue.bullmq.producer',
            );
            const consumerSpan = container.items.find(
              item => item.attributes['sentry.origin']?.value === 'auto.queue.bullmq.consumer',
            );

            expect(producerSegment).toBeDefined();
            expect(producerSpan).toEqual(
              expect.objectContaining({
                parent_span_id: producerSegment!.span_id,
                is_segment: false,
                status: 'ok',
                attributes: expect.objectContaining({
                  'sentry.op': { type: 'string', value: 'queue.submit' },
                  'messaging.system': { type: 'string', value: 'bullmq' },
                }),
              }),
            );

            const { trace_id: producerTraceId, span_id: producerSpanId } = producerSpan!;

            expect(consumerSpan).toEqual(
              expect.objectContaining({
                is_segment: true,
                status: 'ok',
                attributes: expect.objectContaining({
                  'sentry.op': { type: 'string', value: 'queue.task' },
                  'messaging.system': { type: 'string', value: 'bullmq' },
                  'sentry.previous_trace': { type: 'string', value: `${producerTraceId}-${producerSpanId}-1` },
                }),
                links: [
                  {
                    trace_id: producerTraceId,
                    span_id: producerSpanId,
                    sampled: true,
                    attributes: { 'sentry.link.type': { type: 'string', value: 'previous_trace' } },
                  },
                ],
              }),
            );
          },
        })
        .start()
        .completed();
    });

    test('emits completion counter and duration histogram for processed jobs', { timeout: 90_000 }, async () => {
      await createRunner()
        .ignore('span')
        .expect({
          trace_metric: (metrics: SerializedMetricContainer) => {
            const items = metrics.items || [];

            expect(items).toHaveLength(2);
            expect(items).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  name: 'bullmq.jobs.completed',
                  type: 'counter',
                  value: expect.any(Number),
                }),
                expect.objectContaining({
                  name: 'bullmq.job.duration',
                  type: 'distribution',
                  unit: 'ms',
                  value: expect.any(Number),
                }),
              ]),
            );
          },
        })
        .start()
        .completed();
    });
  });
});
