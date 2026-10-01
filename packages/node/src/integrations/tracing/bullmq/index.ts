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
 * @see https://docs.bullmq.io/guide/telemetry
 */
export class BullMQTelemetry implements Telemetry<SentryContext> {
  public tracer: Tracer<SentryContext>;
  public contextManager: ContextManager<SentryContext>;
  public meter: Meter;

  public constructor() {
    this.tracer = new SentryBullMQTracer();
    this.contextManager = new SentryBullMQContextManager();
    this.meter = new SentryBullMQMeter();
  }
}
