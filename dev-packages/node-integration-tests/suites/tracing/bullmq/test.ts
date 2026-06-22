import type { SerializedMetricContainer, TransactionEvent } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('bullmq', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('traces producer and consumer operations with queue attributes', { timeout: 90_000 }, async () => {
      const receivedTransactions: TransactionEvent[] = [];

      await createRunner()
        .withDockerCompose({ workingDirectory: [__dirname] })
        .ignore('trace_metric')
        .expectN(3, {
          transaction: (transaction: TransactionEvent) => {
            receivedTransactions.push(transaction);
          },
        })
        .expect({
          transaction: (transaction: TransactionEvent) => {
            receivedTransactions.push(transaction);

            const producerTransaction = receivedTransactions.find(t => t.transaction === 'enqueue test-job');
            const consumerTransaction = receivedTransactions.find(
              t => t.contexts?.trace?.data?.['sentry.origin'] === 'auto.queue.bullmq.consumer',
            );

            expect(producerTransaction).toBeDefined();
            const producerSpan = producerTransaction!.spans?.find(s => s.origin === 'auto.queue.bullmq.producer');
            expect(producerSpan).toBeDefined();
            expect(producerSpan!.op).toBe('queue.submit');
            expect(producerSpan!.status).toBe('ok');
            expect(producerSpan!.data?.['messaging.system']).toBe('bullmq');

            expect(consumerTransaction).toBeDefined();
            expect(consumerTransaction!.contexts?.trace).toEqual(
              expect.objectContaining({
                op: 'queue.task',
                status: 'ok',
                data: expect.objectContaining({
                  'messaging.system': 'bullmq',
                  'sentry.op': 'queue.task',
                  'sentry.origin': 'auto.queue.bullmq.consumer',
                  'sentry.previous_trace': expect.stringContaining(
                    producerTransaction!.contexts!.trace!.trace_id as string,
                  ),
                }),
              }),
            );
          },
        })
        .start()
        .completed();
    });

    test('emits completion counter and duration histogram for processed jobs', { timeout: 90_000 }, async () => {
      await createRunner()
        .withDockerCompose({ workingDirectory: [__dirname] })
        .ignore('transaction')
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
