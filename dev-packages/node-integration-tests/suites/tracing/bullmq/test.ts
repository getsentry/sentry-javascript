import type { Event, SerializedMetric } from '@sentry/core';
import { SDK_VERSION } from '@sentry/core';
import { afterAll, expect } from 'vitest';
import { EXPECTED_SDK_NAME } from '../../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests, describeWithDockerCompose } from '../../../utils/runner';

describeWithDockerCompose('bullmq', { workingDirectory: [__dirname] }, () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('traces producer and consumer operations with queue attributes', { timeout: 90_000 }, async () => {
      const runner = createRunner().ignore('trace_metric');
      const producerSpansPromise = runner.collectStreamedSpansUntilSegment('enqueue test-jobs');
      const consumer1SpansPromise = runner.collectStreamedSpansUntilSegment(
        span => span.attributes['messaging.bullmq.job.name']?.value === 'test-job-1',
      );
      const consumer2SpansPromise = runner.collectStreamedSpansUntilSegment(
        span => span.attributes['messaging.bullmq.job.name']?.value === 'test-job-2',
      );

      await runner.start().completed();

      const producerSpans = await producerSpansPromise;
      const consumerSpans = [await consumer1SpansPromise, await consumer2SpansPromise];
      const producerSegment = producerSpans.find(span => span.is_segment && span.name === 'enqueue test-jobs')!;
      const publishSpans = producerSpans
        .filter(span => span.attributes['messaging.system']?.value === 'bullmq')
        .sort((a, b) => a.start_timestamp - b.start_timestamp);
      const consumerSegments = consumerSpans.map(spans =>
        spans.find(span => span.is_segment && span.name === 'process test-queue')!,
      );

      expect(
        publishSpans.map(span => ({
          name: span.name,
          parent_span_id: span.parent_span_id,
          status: span.status,
          attributes: span.attributes,
        })),
      ).toEqual(
        ['test-job-1', 'test-job-2'].map(jobName => ({
          name: `add test-queue.${jobName}`,
          parent_span_id: producerSegment.span_id,
          status: 'ok',
          attributes: {
            'sentry.op': { type: 'string', value: 'queue.publish' },
            'sentry.origin': { type: 'string', value: 'auto.queue.bullmq.producer' },
            'messaging.system': { type: 'string', value: 'bullmq' },
            'messaging.destination.name': { type: 'string', value: 'test-queue' },
            'messaging.operation.name': { type: 'string', value: 'add' },
            'messaging.message.id': { type: 'string', value: expect.any(String) },
            'messaging.bullmq.job.name': { type: 'string', value: jobName },
            'sentry.environment': { type: 'string', value: 'production' },
            'sentry.is_localhost': { type: 'boolean', value: false },
            'sentry.release': { type: 'string', value: '1.0' },
            'sentry.sdk.name': { type: 'string', value: EXPECTED_SDK_NAME },
            'sentry.sdk.version': { type: 'string', value: SDK_VERSION },
            'sentry.segment.id': { type: 'string', value: producerSegment.span_id },
            'sentry.segment.name': { type: 'string', value: 'enqueue test-jobs' },
            'sentry.trace_lifecycle': { type: 'string', value: 'stream' },
          },
        })),
      );

      expect(
        consumerSpans.map(spans =>
          spans
            .filter(span => span.attributes['messaging.system']?.value === 'bullmq')
            .sort((a, b) => a.start_timestamp - b.start_timestamp)
            .map(span => ({
              name: span.name,
              is_segment: span.is_segment,
              status: span.status,
              attributes: span.attributes,
            })),
        ),
      ).toEqual(
        ['test-job-1', 'test-job-2'].map((jobName, index) => [
          {
            name: 'process test-queue',
            is_segment: true,
            status: 'ok',
            attributes: {
              'sentry.op': { type: 'string', value: 'queue.process' },
              'sentry.origin': { type: 'string', value: 'auto.queue.bullmq.consumer' },
              'messaging.system': { type: 'string', value: 'bullmq' },
              'messaging.destination.name': { type: 'string', value: 'test-queue' },
              'messaging.operation.name': { type: 'string', value: 'process' },
              'messaging.message.id': { type: 'string', value: expect.any(String) },
              'messaging.message.retry.count': { type: 'integer', value: 0 },
              'messaging.client.id': { type: 'string', value: expect.any(String) },
              'messaging.bullmq.job.name': { type: 'string', value: jobName },
              'messaging.bullmq.job.processed_timestamp': { type: 'integer', value: expect.any(Number) },
              'messaging.bullmq.job.attempt_finished_timestamp': { type: 'integer', value: expect.any(Number) },
              'sentry.environment': { type: 'string', value: 'production' },
              'sentry.is_localhost': { type: 'boolean', value: false },
              'sentry.release': { type: 'string', value: '1.0' },
              'sentry.sdk.name': { type: 'string', value: EXPECTED_SDK_NAME },
              'sentry.sdk.version': { type: 'string', value: SDK_VERSION },
              'sentry.segment.id': { type: 'string', value: consumerSegments[index]!.span_id },
              'sentry.segment.name': { type: 'string', value: 'process test-queue' },
              'sentry.trace_lifecycle': { type: 'string', value: 'stream' },
              'sentry.sample_rate': { type: 'integer', value: 1 },
              'sentry.sdk.integrations': { type: 'array', value: expect.any(Array) },
              'sentry.segment.name.source': { type: 'string', value: 'custom' },
            },
          },
          {
            name: 'complete test-queue',
            is_segment: false,
            status: 'ok',
            attributes: {
              'sentry.op': { type: 'string', value: 'queue' },
              'sentry.origin': { type: 'string', value: 'auto.queue.bullmq' },
              'messaging.system': { type: 'string', value: 'bullmq' },
              'messaging.destination.name': { type: 'string', value: 'test-queue' },
              'messaging.operation.name': { type: 'string', value: 'complete' },
              'messaging.message.id': { type: 'string', value: expect.any(String) },
              'messaging.bullmq.job.name': { type: 'string', value: jobName },
              'sentry.environment': { type: 'string', value: 'production' },
              'sentry.is_localhost': { type: 'boolean', value: false },
              'sentry.release': { type: 'string', value: '1.0' },
              'sentry.sdk.name': { type: 'string', value: EXPECTED_SDK_NAME },
              'sentry.sdk.version': { type: 'string', value: SDK_VERSION },
              'sentry.segment.id': { type: 'string', value: consumerSegments[index]!.span_id },
              'sentry.segment.name': { type: 'string', value: 'process test-queue' },
              'sentry.trace_lifecycle': { type: 'string', value: 'stream' },
            },
          },
        ]),
      );

      expect(consumerSegments.map(segment => segment.attributes['messaging.message.id'])).toEqual(
        publishSpans.map(span => span.attributes['messaging.message.id']),
      );
      expect(consumerSegments.map(segment => segment.links)).toEqual(
        publishSpans.map(span => [
          {
            trace_id: span.trace_id,
            span_id: span.span_id,
            sampled: true,
            attributes: { 'sentry.link.type': { type: 'string', value: 'message_origin' } },
          },
        ]),
      );
      expect(new Set([producerSegment.trace_id, ...consumerSegments.map(segment => segment.trace_id)]).size).toBe(3);
    });

    test('emits completion counter and duration histogram for processed jobs', { timeout: 90_000 }, async () => {
      let metrics: SerializedMetric[] = [];

      await createRunner()
        .ignore('span')
        .expect({
          trace_metric: container => {
            metrics = container.items;
          },
        })
        .start()
        .completed();

      expect(
        metrics.map(metric => ({
          name: metric.name,
          type: metric.type,
          unit: metric.unit,
          value: metric.value,
          attributes: metric.attributes,
        })),
      ).toEqual(
        ['test-job-1', 'test-job-2'].flatMap(jobName => [
          {
            name: 'messaging.bullmq.jobs.completed',
            type: 'counter',
            unit: 'none',
            value: 1,
            attributes: {
              'messaging.destination.name': { type: 'string', value: 'test-queue' },
              'messaging.bullmq.job.name': { type: 'string', value: jobName },
              'messaging.bullmq.job.state': { type: 'string', value: 'completed' },
              'sentry.release': { type: 'string', value: '1.0' },
              'sentry.sdk.name': { type: 'string', value: EXPECTED_SDK_NAME },
              'sentry.sdk.version': { type: 'string', value: SDK_VERSION },
              'sentry.timestamp.sequence': { type: 'integer', value: expect.any(Number) },
              'server.address': { type: 'string', value: expect.any(String) },
            },
          },
          {
            name: 'messaging.process.duration',
            type: 'distribution',
            unit: 'second',
            value: expect.any(Number),
            attributes: {
              'messaging.system': { type: 'string', value: 'bullmq' },
              'messaging.operation.name': { type: 'string', value: 'process' },
              'messaging.destination.name': { type: 'string', value: 'test-queue' },
              'messaging.bullmq.job.name': { type: 'string', value: jobName },
              'messaging.bullmq.job.state': { type: 'string', value: 'completed' },
              'sentry.release': { type: 'string', value: '1.0' },
              'sentry.sdk.name': { type: 'string', value: EXPECTED_SDK_NAME },
              'sentry.sdk.version': { type: 'string', value: SDK_VERSION },
              'sentry.timestamp.sequence': { type: 'integer', value: expect.any(Number) },
              'server.address': { type: 'string', value: expect.any(String) },
            },
          },
        ]),
      );
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario-failed-job.mjs', 'instrument.mjs', (createRunner, test) => {
    test(
      'captures an error for a failed job and sets the error status on its process span',
      { timeout: 90_000 },
      async () => {
        let errorEvent: Event | undefined;
        const runner = createRunner().ignore('trace_metric');
        const consumerSpansPromise = runner.collectStreamedSpansUntilSegment('process test-failed-queue');

        await runner
          .expect({
            event: event => {
              errorEvent = event;
            },
          })
          .start()
          .completed();

        const consumerSpans = await consumerSpansPromise;
        const processSpan = consumerSpans.find(span => span.is_segment && span.name === 'process test-failed-queue')!;

        expect(
          consumerSpans
            .filter(span => span.attributes['messaging.system']?.value === 'bullmq')
            .sort((a, b) => a.start_timestamp - b.start_timestamp)
            .map(span => ({
              name: span.name,
              status: span.status,
              attributes: span.attributes,
            })),
        ).toEqual([
          {
            name: 'process test-failed-queue',
            status: 'error',
            attributes: {
              'sentry.op': { type: 'string', value: 'queue.process' },
              'sentry.origin': { type: 'string', value: 'auto.queue.bullmq.consumer' },
              'messaging.system': { type: 'string', value: 'bullmq' },
              'messaging.destination.name': { type: 'string', value: 'test-failed-queue' },
              'messaging.operation.name': { type: 'string', value: 'process' },
              'messaging.message.id': { type: 'string', value: expect.any(String) },
              'messaging.message.retry.count': { type: 'integer', value: 0 },
              'messaging.client.id': { type: 'string', value: expect.any(String) },
              'messaging.bullmq.job.name': { type: 'string', value: 'failing-job' },
              'messaging.bullmq.job.processed_timestamp': { type: 'integer', value: expect.any(Number) },
              'messaging.bullmq.job.attempt_finished_timestamp': { type: 'integer', value: expect.any(Number) },
              'sentry.environment': { type: 'string', value: 'production' },
              'sentry.is_localhost': { type: 'boolean', value: false },
              'sentry.release': { type: 'string', value: '1.0' },
              'sentry.sdk.name': { type: 'string', value: EXPECTED_SDK_NAME },
              'sentry.sdk.version': { type: 'string', value: SDK_VERSION },
              'sentry.segment.id': { type: 'string', value: processSpan.span_id },
              'sentry.segment.name': { type: 'string', value: 'process test-failed-queue' },
              'sentry.trace_lifecycle': { type: 'string', value: 'stream' },
              'sentry.sample_rate': { type: 'integer', value: 1 },
              'sentry.sdk.integrations': { type: 'array', value: expect.any(Array) },
              'sentry.segment.name.source': { type: 'string', value: 'custom' },
              'sentry.status.message': { type: 'string', value: 'internal_error' },
            },
          },
          {
            name: 'fail test-failed-queue',
            status: 'ok',
            attributes: {
              'sentry.op': { type: 'string', value: 'queue' },
              'sentry.origin': { type: 'string', value: 'auto.queue.bullmq' },
              'messaging.system': { type: 'string', value: 'bullmq' },
              'messaging.destination.name': { type: 'string', value: 'test-failed-queue' },
              'messaging.operation.name': { type: 'string', value: 'fail' },
              'messaging.message.id': { type: 'string', value: expect.any(String) },
              'messaging.bullmq.job.name': { type: 'string', value: 'failing-job' },
              'sentry.environment': { type: 'string', value: 'production' },
              'sentry.is_localhost': { type: 'boolean', value: false },
              'sentry.release': { type: 'string', value: '1.0' },
              'sentry.sdk.name': { type: 'string', value: EXPECTED_SDK_NAME },
              'sentry.sdk.version': { type: 'string', value: SDK_VERSION },
              'sentry.segment.id': { type: 'string', value: processSpan.span_id },
              'sentry.segment.name': { type: 'string', value: 'process test-failed-queue' },
              'sentry.trace_lifecycle': { type: 'string', value: 'stream' },
            },
          },
        ]);
        expect(errorEvent?.exception?.values).toHaveLength(1);
        expect(errorEvent?.exception?.values?.[0]?.type).toBe('Error');
        expect(errorEvent?.exception?.values?.[0]?.value).toBe('Job failed on purpose');
        expect(errorEvent?.exception?.values?.[0]?.mechanism).toEqual({ type: 'auto.queue.bullmq', handled: false });
        expect(errorEvent?.exception?.values?.[0]?.stacktrace).toBeUndefined();
        expect(errorEvent?.contexts?.trace?.trace_id).toBe(processSpan.trace_id);
        expect(errorEvent?.contexts?.trace?.span_id).toBe(processSpan.span_id);
      },
    );
  });

  createEsmAndCjsTests(__dirname, 'scenario-attributes.mjs', 'instrument.mjs', (createRunner, test) => {
    test('sends the attributes and metrics of all BullMQ operations', { timeout: 90_000 }, async () => {
      let metrics: SerializedMetric[] = [];
      const runner = createRunner();
      const opsSpansPromise = runner.collectStreamedSpansUntilSegment('bullmq attributes');
      const processSpansPromise = runner.collectStreamedSpansUntilSegment('process attributes-process-queue');

      await runner
        .expect({
          trace_metric: container => {
            metrics = container.items;
          },
        })
        .start()
        .completed();

      const opsSpans = await opsSpansPromise;
      const processSpans = await processSpansPromise;
      const opsSegment = opsSpans.find(span => span.is_segment && span.name === 'bullmq attributes')!;
      const processSegment = processSpans.find(
        span => span.is_segment && span.name === 'process attributes-process-queue',
      )!;

      expect(
        opsSpans
          .filter(span => span.attributes['messaging.system']?.value === 'bullmq')
          .sort((a, b) => a.start_timestamp - b.start_timestamp)
          .map(span => ({
            name: span.name,
            status: span.status,
            attributes: span.attributes,
          })),
      ).toEqual(
        [
          {
            name: 'add attributes-process-queue.process-job',
            status: 'ok',
            attributes: {
              'sentry.op': { type: 'string', value: 'queue.publish' },
              'sentry.origin': { type: 'string', value: 'auto.queue.bullmq.producer' },
              'messaging.system': { type: 'string', value: 'bullmq' },
              'messaging.destination.name': { type: 'string', value: 'attributes-process-queue' },
              'messaging.operation.name': { type: 'string', value: 'add' },
              'messaging.message.id': { type: 'string', value: expect.any(String) },
              'messaging.bullmq.job.name': { type: 'string', value: 'process-job' },
            },
          },
          {
            name: 'addBulk attributes-ops-queue',
            status: 'ok',
            attributes: {
              'sentry.op': { type: 'string', value: 'queue.publish' },
              'sentry.origin': { type: 'string', value: 'auto.queue.bullmq.producer' },
              'messaging.system': { type: 'string', value: 'bullmq' },
              'messaging.destination.name': { type: 'string', value: 'attributes-ops-queue' },
              'messaging.operation.name': { type: 'string', value: 'addBulk' },
              'messaging.batch.message_count': { type: 'integer', value: 2 },
              'messaging.bullmq.job.bulk.names': { type: 'array', value: ['bulk-job-1', 'bulk-job-2'] },
            },
          },
          {
            name: 'addFlow attributes-ops-queue',
            status: 'ok',
            attributes: {
              'sentry.op': { type: 'string', value: 'queue.publish' },
              'sentry.origin': { type: 'string', value: 'auto.queue.bullmq.producer' },
              'messaging.system': { type: 'string', value: 'bullmq' },
              'messaging.destination.name': { type: 'string', value: 'attributes-ops-queue' },
              'messaging.operation.name': { type: 'string', value: 'addFlow' },
              'messaging.bullmq.flow.name': { type: 'string', value: 'flow-root' },
            },
          },
          {
            name: 'addNode attributes-ops-queue',
            status: 'ok',
            attributes: {
              'sentry.op': { type: 'string', value: 'queue' },
              'sentry.origin': { type: 'string', value: 'auto.queue.bullmq' },
              'messaging.system': { type: 'string', value: 'bullmq' },
              'messaging.destination.name': { type: 'string', value: 'attributes-ops-queue' },
              'messaging.operation.name': { type: 'string', value: 'addNode' },
              'messaging.message.id': { type: 'string', value: expect.any(String) },
              'messaging.bullmq.job.name': { type: 'string', value: 'flow-root' },
            },
          },
          {
            name: 'addNode attributes-ops-queue',
            status: 'ok',
            attributes: {
              'sentry.op': { type: 'string', value: 'queue' },
              'sentry.origin': { type: 'string', value: 'auto.queue.bullmq' },
              'messaging.system': { type: 'string', value: 'bullmq' },
              'messaging.destination.name': { type: 'string', value: 'attributes-ops-queue' },
              'messaging.operation.name': { type: 'string', value: 'addNode' },
              'messaging.message.id': { type: 'string', value: expect.any(String) },
              'messaging.bullmq.job.name': { type: 'string', value: 'flow-child' },
            },
          },
          {
            name: 'add attributes-ops-queue.scheduled-job',
            status: 'ok',
            attributes: {
              'sentry.op': { type: 'string', value: 'queue.publish' },
              'sentry.origin': { type: 'string', value: 'auto.queue.bullmq.producer' },
              'messaging.system': { type: 'string', value: 'bullmq' },
              'messaging.destination.name': { type: 'string', value: 'attributes-ops-queue' },
              'messaging.operation.name': { type: 'string', value: 'add' },
              'messaging.message.id': {
                type: 'string',
                value: expect.stringMatching(/^repeat:attributes-scheduler:\d+$/),
              },
              'messaging.bullmq.job.scheduler.id': { type: 'string', value: 'attributes-scheduler' },
            },
          },
          {
            name: 'add attributes-ops-queue.progress-job',
            status: 'ok',
            attributes: {
              'sentry.op': { type: 'string', value: 'queue.publish' },
              'sentry.origin': { type: 'string', value: 'auto.queue.bullmq.producer' },
              'messaging.system': { type: 'string', value: 'bullmq' },
              'messaging.destination.name': { type: 'string', value: 'attributes-ops-queue' },
              'messaging.operation.name': { type: 'string', value: 'add' },
              'messaging.message.id': { type: 'string', value: expect.any(String) },
              'messaging.bullmq.job.name': { type: 'string', value: 'progress-job' },
            },
          },
          {
            name: 'updateJobProgress attributes-ops-queue',
            status: 'ok',
            attributes: {
              'sentry.op': { type: 'string', value: 'queue' },
              'sentry.origin': { type: 'string', value: 'auto.queue.bullmq' },
              'messaging.system': { type: 'string', value: 'bullmq' },
              'messaging.destination.name': { type: 'string', value: 'attributes-ops-queue' },
              'messaging.operation.name': { type: 'string', value: 'updateJobProgress' },
              'messaging.message.id': { type: 'string', value: expect.any(String) },
            },
          },
          {
            name: 'remove attributes-ops-queue',
            status: 'ok',
            attributes: {
              'sentry.op': { type: 'string', value: 'queue' },
              'sentry.origin': { type: 'string', value: 'auto.queue.bullmq' },
              'messaging.system': { type: 'string', value: 'bullmq' },
              'messaging.destination.name': { type: 'string', value: 'attributes-ops-queue' },
              'messaging.operation.name': { type: 'string', value: 'remove' },
              'messaging.message.id': { type: 'string', value: expect.any(String) },
            },
          },
          {
            name: 'removeDeduplicationKey attributes-ops-queue',
            status: 'ok',
            attributes: {
              'sentry.op': { type: 'string', value: 'queue' },
              'sentry.origin': { type: 'string', value: 'auto.queue.bullmq' },
              'messaging.system': { type: 'string', value: 'bullmq' },
              'messaging.destination.name': { type: 'string', value: 'attributes-ops-queue' },
              'messaging.operation.name': { type: 'string', value: 'removeDeduplicationKey' },
              'messaging.bullmq.job.deduplication.key': { type: 'string', value: 'attributes-deduplication-id' },
            },
          },
          {
            name: 'removeDebounceKey attributes-ops-queue',
            status: 'ok',
            attributes: {
              'sentry.op': { type: 'string', value: 'queue' },
              'sentry.origin': { type: 'string', value: 'auto.queue.bullmq' },
              'messaging.system': { type: 'string', value: 'bullmq' },
              'messaging.destination.name': { type: 'string', value: 'attributes-ops-queue' },
              'messaging.operation.name': { type: 'string', value: 'removeDebounceKey' },
              'messaging.bullmq.job.key': { type: 'string', value: 'attributes-debounce-id' },
            },
          },
          {
            name: 'retryJobs attributes-ops-queue',
            status: 'ok',
            attributes: {
              'sentry.op': { type: 'string', value: 'queue' },
              'sentry.origin': { type: 'string', value: 'auto.queue.bullmq' },
              'messaging.system': { type: 'string', value: 'bullmq' },
              'messaging.destination.name': { type: 'string', value: 'attributes-ops-queue' },
              'messaging.operation.name': { type: 'string', value: 'retryJobs' },
            },
          },
          {
            name: 'promoteJobs attributes-ops-queue',
            status: 'ok',
            attributes: {
              'sentry.op': { type: 'string', value: 'queue' },
              'sentry.origin': { type: 'string', value: 'auto.queue.bullmq' },
              'messaging.system': { type: 'string', value: 'bullmq' },
              'messaging.destination.name': { type: 'string', value: 'attributes-ops-queue' },
              'messaging.operation.name': { type: 'string', value: 'promoteJobs' },
            },
          },
          {
            name: 'trimEvents attributes-ops-queue',
            status: 'ok',
            attributes: {
              'sentry.op': { type: 'string', value: 'queue' },
              'sentry.origin': { type: 'string', value: 'auto.queue.bullmq' },
              'messaging.system': { type: 'string', value: 'bullmq' },
              'messaging.destination.name': { type: 'string', value: 'attributes-ops-queue' },
              'messaging.operation.name': { type: 'string', value: 'trimEvents' },
              'messaging.bullmq.queue.event.max_length': { type: 'integer', value: 100 },
            },
          },
          {
            // `messaging.bullmq.queue.clean.count` replaces `messaging.bullmq.job.ids` in BullMQ 6.
            name: 'clean attributes-ops-queue',
            status: 'ok',
            attributes: {
              'sentry.op': { type: 'string', value: 'queue' },
              'sentry.origin': { type: 'string', value: 'auto.queue.bullmq' },
              'messaging.system': { type: 'string', value: 'bullmq' },
              'messaging.destination.name': { type: 'string', value: 'attributes-ops-queue' },
              'messaging.operation.name': { type: 'string', value: 'clean' },
              'messaging.bullmq.job.type': { type: 'string', value: 'completed' },
              'messaging.bullmq.job.ids': { type: 'array', value: [] },
              'messaging.bullmq.queue.clean.limit': { type: 'integer', value: 100 },
              'messaging.bullmq.queue.grace': { type: 'integer', value: 0 },
            },
          },
          {
            name: 'getNextJob attributes-ops-queue',
            status: 'ok',
            attributes: {
              'sentry.op': { type: 'string', value: 'queue' },
              'sentry.origin': { type: 'string', value: 'auto.queue.bullmq' },
              'messaging.system': { type: 'string', value: 'bullmq' },
              'messaging.destination.name': { type: 'string', value: 'attributes-ops-queue' },
              'messaging.operation.name': { type: 'string', value: 'getNextJob' },
              'messaging.message.id': { type: 'string', value: expect.any(String) },
              'messaging.client.id': { type: 'string', value: expect.any(String) },
              'messaging.bullmq.worker.name': { type: 'string', value: 'attributes-ops-worker' },
            },
          },
          {
            name: 'moveStalledJobsToWait attributes-ops-queue',
            status: 'ok',
            attributes: {
              'sentry.op': { type: 'string', value: 'queue' },
              'sentry.origin': { type: 'string', value: 'auto.queue.bullmq' },
              'messaging.system': { type: 'string', value: 'bullmq' },
              'messaging.destination.name': { type: 'string', value: 'attributes-ops-queue' },
              'messaging.operation.name': { type: 'string', value: 'moveStalledJobsToWait' },
              'messaging.client.id': { type: 'string', value: expect.any(String) },
              'messaging.bullmq.worker.name': { type: 'string', value: 'attributes-ops-worker' },
              'messaging.bullmq.worker.stalled_jobs': { type: 'array', value: [] },
            },
          },
          {
            name: 'extendLocks attributes-ops-queue',
            status: 'ok',
            attributes: {
              'sentry.op': { type: 'string', value: 'queue' },
              'sentry.origin': { type: 'string', value: 'auto.queue.bullmq' },
              'messaging.system': { type: 'string', value: 'bullmq' },
              'messaging.destination.name': { type: 'string', value: 'attributes-ops-queue' },
              'messaging.operation.name': { type: 'string', value: 'extendLocks' },
              'messaging.client.id': { type: 'string', value: expect.any(String) },
              'messaging.bullmq.worker.name': { type: 'string', value: 'attributes-ops-worker' },
              'messaging.bullmq.worker.jobs_to_extend_locks': { type: 'array', value: [] },
            },
          },
          {
            name: 'rateLimit attributes-ops-queue',
            status: 'ok',
            attributes: {
              'sentry.op': { type: 'string', value: 'queue' },
              'sentry.origin': { type: 'string', value: 'auto.queue.bullmq' },
              'messaging.system': { type: 'string', value: 'bullmq' },
              'messaging.destination.name': { type: 'string', value: 'attributes-ops-queue' },
              'messaging.operation.name': { type: 'string', value: 'rateLimit' },
              'messaging.client.id': { type: 'string', value: expect.any(String) },
              'messaging.bullmq.worker.rate_limit': { type: 'integer', value: 1 },
            },
          },
          {
            name: 'pause attributes-ops-queue',
            status: 'ok',
            attributes: {
              'sentry.op': { type: 'string', value: 'queue' },
              'sentry.origin': { type: 'string', value: 'auto.queue.bullmq' },
              'messaging.system': { type: 'string', value: 'bullmq' },
              'messaging.destination.name': { type: 'string', value: 'attributes-ops-queue' },
              'messaging.operation.name': { type: 'string', value: 'pause' },
              'messaging.client.id': { type: 'string', value: expect.any(String) },
              'messaging.bullmq.worker.name': { type: 'string', value: 'attributes-ops-worker' },
              'messaging.bullmq.worker.do_not_wait_active': { type: 'boolean', value: true },
            },
          },
          {
            name: 'close attributes-ops-queue',
            status: 'ok',
            attributes: {
              'sentry.op': { type: 'string', value: 'queue' },
              'sentry.origin': { type: 'string', value: 'auto.queue.bullmq' },
              'messaging.system': { type: 'string', value: 'bullmq' },
              'messaging.destination.name': { type: 'string', value: 'attributes-ops-queue' },
              'messaging.operation.name': { type: 'string', value: 'close' },
              'messaging.client.id': { type: 'string', value: expect.any(String) },
              'messaging.bullmq.worker.name': { type: 'string', value: 'attributes-ops-worker' },
              'messaging.bullmq.worker.force_close': { type: 'boolean', value: true },
            },
          },
          {
            name: 'rateLimit attributes-ops-queue',
            status: 'ok',
            attributes: {
              'sentry.op': { type: 'string', value: 'queue' },
              'sentry.origin': { type: 'string', value: 'auto.queue.bullmq' },
              'messaging.system': { type: 'string', value: 'bullmq' },
              'messaging.destination.name': { type: 'string', value: 'attributes-ops-queue' },
              'messaging.operation.name': { type: 'string', value: 'rateLimit' },
              'messaging.bullmq.queue.rate_limit': { type: 'integer', value: 1 },
            },
          },
          {
            name: 'drain attributes-ops-queue',
            status: 'ok',
            attributes: {
              'sentry.op': { type: 'string', value: 'queue' },
              'sentry.origin': { type: 'string', value: 'auto.queue.bullmq' },
              'messaging.system': { type: 'string', value: 'bullmq' },
              'messaging.destination.name': { type: 'string', value: 'attributes-ops-queue' },
              'messaging.operation.name': { type: 'string', value: 'drain' },
              'messaging.bullmq.queue.drain.delay': { type: 'boolean', value: true },
            },
          },
        ].map(span => ({
          ...span,
          attributes: {
            ...span.attributes,
            'sentry.environment': { type: 'string', value: 'production' },
            'sentry.is_localhost': { type: 'boolean', value: false },
            'sentry.release': { type: 'string', value: '1.0' },
            'sentry.sdk.name': { type: 'string', value: EXPECTED_SDK_NAME },
            'sentry.sdk.version': { type: 'string', value: SDK_VERSION },
            'sentry.segment.id': { type: 'string', value: opsSegment.span_id },
            'sentry.segment.name': { type: 'string', value: 'bullmq attributes' },
            'sentry.trace_lifecycle': { type: 'string', value: 'stream' },
          },
        })),
      );

      expect(
        processSpans
          .filter(span => span.attributes['messaging.system']?.value === 'bullmq')
          .sort((a, b) => a.start_timestamp - b.start_timestamp)
          .map(span => ({
            name: span.name,
            status: span.status,
            attributes: span.attributes,
          })),
      ).toEqual([
        {
          name: 'process attributes-process-queue',
          status: 'ok',
          attributes: {
            'sentry.op': { type: 'string', value: 'queue.process' },
            'sentry.origin': { type: 'string', value: 'auto.queue.bullmq.consumer' },
            'messaging.system': { type: 'string', value: 'bullmq' },
            'messaging.destination.name': { type: 'string', value: 'attributes-process-queue' },
            'messaging.operation.name': { type: 'string', value: 'process' },
            'messaging.message.id': { type: 'string', value: expect.any(String) },
            'messaging.message.retry.count': { type: 'integer', value: 0 },
            'messaging.client.id': { type: 'string', value: expect.any(String) },
            'messaging.bullmq.worker.name': { type: 'string', value: 'attributes-worker' },
            'messaging.bullmq.job.name': { type: 'string', value: 'process-job' },
            'messaging.bullmq.job.processed_timestamp': { type: 'integer', value: expect.any(Number) },
            'messaging.bullmq.job.attempt_finished_timestamp': { type: 'integer', value: expect.any(Number) },
            'sentry.environment': { type: 'string', value: 'production' },
            'sentry.is_localhost': { type: 'boolean', value: false },
            'sentry.release': { type: 'string', value: '1.0' },
            'sentry.sdk.name': { type: 'string', value: EXPECTED_SDK_NAME },
            'sentry.sdk.version': { type: 'string', value: SDK_VERSION },
            'sentry.segment.id': { type: 'string', value: processSegment.span_id },
            'sentry.segment.name': { type: 'string', value: 'process attributes-process-queue' },
            'sentry.trace_lifecycle': { type: 'string', value: 'stream' },
            'sentry.sample_rate': { type: 'integer', value: 1 },
            'sentry.sdk.integrations': { type: 'array', value: expect.any(Array) },
            'sentry.segment.name.source': { type: 'string', value: 'custom' },
          },
        },
        {
          name: 'complete attributes-process-queue',
          status: 'ok',
          attributes: {
            'sentry.op': { type: 'string', value: 'queue' },
            'sentry.origin': { type: 'string', value: 'auto.queue.bullmq' },
            'messaging.system': { type: 'string', value: 'bullmq' },
            'messaging.destination.name': { type: 'string', value: 'attributes-process-queue' },
            'messaging.operation.name': { type: 'string', value: 'complete' },
            'messaging.message.id': { type: 'string', value: expect.any(String) },
            'messaging.bullmq.job.name': { type: 'string', value: 'process-job' },
            'sentry.environment': { type: 'string', value: 'production' },
            'sentry.is_localhost': { type: 'boolean', value: false },
            'sentry.release': { type: 'string', value: '1.0' },
            'sentry.sdk.name': { type: 'string', value: EXPECTED_SDK_NAME },
            'sentry.sdk.version': { type: 'string', value: SDK_VERSION },
            'sentry.segment.id': { type: 'string', value: processSegment.span_id },
            'sentry.segment.name': { type: 'string', value: 'process attributes-process-queue' },
            'sentry.trace_lifecycle': { type: 'string', value: 'stream' },
          },
        },
      ]);

      expect(
        metrics.map(metric => ({
          name: metric.name,
          type: metric.type,
          unit: metric.unit,
          value: metric.value,
          attributes: metric.attributes,
        })),
      ).toEqual([
        {
          name: 'messaging.bullmq.jobs.completed',
          type: 'counter',
          unit: 'none',
          value: 1,
          attributes: {
            'messaging.destination.name': { type: 'string', value: 'attributes-process-queue' },
            'messaging.bullmq.job.name': { type: 'string', value: 'process-job' },
            'messaging.bullmq.job.state': { type: 'string', value: 'completed' },
            'sentry.release': { type: 'string', value: '1.0' },
            'sentry.sdk.name': { type: 'string', value: EXPECTED_SDK_NAME },
            'sentry.sdk.version': { type: 'string', value: SDK_VERSION },
            'sentry.timestamp.sequence': { type: 'integer', value: expect.any(Number) },
            'server.address': { type: 'string', value: expect.any(String) },
          },
        },
        {
          name: 'messaging.process.duration',
          type: 'distribution',
          unit: 'second',
          value: expect.any(Number),
          attributes: {
            'messaging.system': { type: 'string', value: 'bullmq' },
            'messaging.operation.name': { type: 'string', value: 'process' },
            'messaging.destination.name': { type: 'string', value: 'attributes-process-queue' },
            'messaging.bullmq.job.name': { type: 'string', value: 'process-job' },
            'messaging.bullmq.job.state': { type: 'string', value: 'completed' },
            'sentry.release': { type: 'string', value: '1.0' },
            'sentry.sdk.name': { type: 'string', value: EXPECTED_SDK_NAME },
            'sentry.sdk.version': { type: 'string', value: SDK_VERSION },
            'sentry.timestamp.sequence': { type: 'integer', value: expect.any(Number) },
            'server.address': { type: 'string', value: expect.any(String) },
          },
        },
        ...[
          { state: 'waiting', value: 0 },
          { state: 'completed', value: 1 },
          { state: 'paused', value: 0 },
        ].map(({ state, value }) => ({
          name: 'messaging.bullmq.queue.jobs',
          type: 'gauge',
          unit: 'none',
          value,
          attributes: {
            'messaging.destination.name': { type: 'string', value: 'attributes-process-queue' },
            'messaging.bullmq.queue.jobs.state': { type: 'string', value: state },
            'sentry.release': { type: 'string', value: '1.0' },
            'sentry.sdk.name': { type: 'string', value: EXPECTED_SDK_NAME },
            'sentry.sdk.version': { type: 'string', value: SDK_VERSION },
            'sentry.timestamp.sequence': { type: 'integer', value: expect.any(Number) },
            'server.address': { type: 'string', value: expect.any(String) },
          },
        })),
      ]);
    });
  });
});
