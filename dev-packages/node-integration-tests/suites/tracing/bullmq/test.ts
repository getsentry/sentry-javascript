import type { SerializedMetricContainer } from '@sentry/core';
import { afterAll, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests, describeWithDockerCompose } from '../../../utils/runner';

describeWithDockerCompose('bullmq', { workingDirectory: [__dirname] }, () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('traces producer and consumer operations with queue attributes', { timeout: 90_000 }, async () => {
      const producerSpans: Record<string, { trace_id: string; span_id: string; messageId: unknown }> = {};
      const consumerSpans: Record<string, { trace_id: string; link: unknown; messageId: unknown }> = {};

      await createRunner()
        .ignore('trace_metric')
        .unordered()
        .expect({
          span: container => {
            const producerSegment = container.items.find(item => item.is_segment && item.name === 'enqueue test-jobs');
            const publishSpans = container.items.filter(
              item => item.attributes['sentry.origin']?.value === 'auto.queue.bullmq.producer',
            );

            expect(producerSegment).toBeDefined();
            expect(publishSpans).toHaveLength(2);

            for (const publishSpan of publishSpans) {
              expect(publishSpan).toEqual(
                expect.objectContaining({
                  parent_span_id: producerSegment!.span_id,
                  is_segment: false,
                  status: 'ok',
                  attributes: expect.objectContaining({
                    'sentry.op': { type: 'string', value: 'queue.publish' },
                    'messaging.system': { type: 'string', value: 'bullmq' },
                    'messaging.destination.name': { type: 'string', value: 'test-queue' },
                    'messaging.message.id': { type: 'string', value: expect.any(String) },
                  }),
                }),
              );

              producerSpans[publishSpan.attributes['bullmq.job.name']!.value as string] = {
                trace_id: publishSpan.trace_id,
                span_id: publishSpan.span_id,
                messageId: publishSpan.attributes['messaging.message.id']!.value,
              };
            }
          },
        })
        .expect({
          span: container => {
            const consumerSegment = container.items.find(
              item => item.is_segment && item.attributes['bullmq.job.name']?.value === 'test-job-1',
            );

            expect(consumerSegment).toEqual(
              expect.objectContaining({
                status: 'ok',
                attributes: expect.objectContaining({
                  'sentry.op': { type: 'string', value: 'queue.process' },
                  'sentry.origin': { type: 'string', value: 'auto.queue.bullmq.consumer' },
                  'messaging.system': { type: 'string', value: 'bullmq' },
                  'messaging.destination.name': { type: 'string', value: 'test-queue' },
                  'messaging.message.id': { type: 'string', value: expect.any(String) },
                  'messaging.message.retry.count': { type: 'integer', value: 0 },
                }),
              }),
            );
            expect(consumerSegment!.attributes['sentry.previous_trace']).toBeUndefined();

            consumerSpans['test-job-1'] = {
              trace_id: consumerSegment!.trace_id,
              link: consumerSegment!.links?.[0],
              messageId: consumerSegment!.attributes['messaging.message.id']!.value,
            };
          },
        })
        .expect({
          span: container => {
            const consumerSegment = container.items.find(
              item => item.is_segment && item.attributes['bullmq.job.name']?.value === 'test-job-2',
            );

            expect(consumerSegment).toEqual(
              expect.objectContaining({
                status: 'ok',
                attributes: expect.objectContaining({
                  'sentry.op': { type: 'string', value: 'queue.process' },
                  'messaging.destination.name': { type: 'string', value: 'test-queue' },
                }),
              }),
            );

            consumerSpans['test-job-2'] = {
              trace_id: consumerSegment!.trace_id,
              link: consumerSegment!.links?.[0],
              messageId: consumerSegment!.attributes['messaging.message.id']!.value,
            };
          },
        })
        .start()
        .completed();

      for (const jobName of ['test-job-1', 'test-job-2']) {
        const producer = producerSpans[jobName]!;
        const consumer = consumerSpans[jobName]!;

        expect(consumer.trace_id).not.toBe(producer.trace_id);
        expect(consumer.messageId).toBe(producer.messageId);
        expect(consumer.link).toEqual({
          trace_id: producer.trace_id,
          span_id: producer.span_id,
          sampled: true,
          attributes: { 'sentry.link.type': { type: 'string', value: 'previous_trace' } },
        });
      }

      expect(consumerSpans['test-job-1']!.trace_id).not.toBe(consumerSpans['test-job-2']!.trace_id);
    });

    test('emits completion counter and duration histogram for processed jobs', { timeout: 90_000 }, async () => {
      await createRunner()
        .ignore('span')
        .expect({
          trace_metric: (metrics: SerializedMetricContainer) => {
            const items = metrics.items || [];

            expect(items).toHaveLength(4);
            expect(items.filter(item => item.name === 'bullmq.jobs.completed')).toEqual([
              expect.objectContaining({ type: 'counter', value: expect.any(Number) }),
              expect.objectContaining({ type: 'counter', value: expect.any(Number) }),
            ]);
            expect(items.filter(item => item.name === 'bullmq.job.duration')).toEqual([
              expect.objectContaining({ type: 'distribution', unit: 'ms', value: expect.any(Number) }),
              expect.objectContaining({ type: 'distribution', unit: 'ms', value: expect.any(Number) }),
            ]);
          },
        })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-failed-job.mjs', 'instrument.mjs', (createRunner, test) => {
    test('captures an error for a failed job in the trace of the job', { timeout: 90_000 }, async () => {
      let consumerTraceId: string | undefined;
      let errorTraceId: string | undefined;

      await createRunner()
        .ignore('trace_metric')
        .unordered()
        .expect({
          event: event => {
            expect(event.exception?.values).toEqual([
              expect.objectContaining({
                type: 'Error',
                value: 'Job failed on purpose',
                mechanism: { type: 'auto.queue.bullmq', handled: false },
              }),
            ]);

            errorTraceId = event.contexts?.trace?.trace_id;
          },
        })
        .expect({
          span: container => {
            const consumerSegment = container.items.find(
              item => item.is_segment && item.attributes['sentry.op']?.value === 'queue.process',
            );

            expect(consumerSegment).toBeDefined();

            consumerTraceId = consumerSegment!.trace_id;
          },
        })
        .start()
        .completed();

      expect(errorTraceId).toBe(consumerTraceId);
    });
  });
});
