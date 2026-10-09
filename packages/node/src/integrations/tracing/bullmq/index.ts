import { SentryBullMQContextManager } from './contextManager';
import { SentryBullMQMeter } from './meter';
import { SentryBullMQTracer } from './tracer';
import type { ContextManager, Meter, Telemetry, Tracer, SentryContext } from './types';

/**
 * A Sentry-specific telemetry implementation for BullMQ.
 *
 * This implements BullMQ's Telemetry interface to provide automatic tracing
 * for queue operations with proper Queue Insights attributes.
 *
 * @example
 * ```javascript
 * import * as Sentry from '@sentry/node';
 * import { Queue, Worker } from 'bullmq';
 *
 * const telemetry = new Sentry.BullMQTelemetry();
 *
 * const queue = new Queue('myQueue', {
 *   connection: { host: '127.0.0.1', port: 6379 },
 *   telemetry,
 * });
 *
 * const worker = new Worker('myQueue', async (job) => {
 *   // Process job
 * }, {
 *   connection: { host: '127.0.0.1', port: 6379 },
 *   telemetry,
 * });
 * ```
 *
 * To also send BullMQ's job metrics to Sentry, use `new Sentry.BullMQTelemetry({ enableMetrics: true })`.
 *
 * @see https://docs.bullmq.io/guide/telemetry
 */
export class BullMQTelemetry implements Telemetry<SentryContext> {
  public tracer: Tracer<SentryContext>;
  public contextManager: ContextManager<SentryContext>;
  public meter?: Meter;

  public constructor(
    options: {
      /**
       * Sends BullMQ's job metrics, such as `bullmq.jobs.completed` and `bullmq.job.duration`, to Sentry. Defaults to `false`.
       */
      enableMetrics?: boolean;
    } = {},
  ) {
    this.tracer = new SentryBullMQTracer();
    this.contextManager = new SentryBullMQContextManager();

    if (options.enableMetrics) {
      this.meter = new SentryBullMQMeter();
    }
  }
}
