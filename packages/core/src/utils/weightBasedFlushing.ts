import type { Client } from '../client';
import type { Log } from '../types/log';
import type { Metric } from '../types/metric';
import type { Primitive } from '../types/misc';
import { isPrimitive } from './is';
import { safeUnref } from './timer';

// Default interval for flushing logs and metrics (5 seconds)
const DEFAULT_FLUSH_INTERVAL = 5000;

/**
 * Sets up weight-based flushing for logs or metrics.
 * This helper function encapsulates the common pattern of:
 * 1. Tracking accumulated weight of items
 * 2. Flushing when weight exceeds threshold (800KB)
 * 3. Flushing after timeout period from the first item
 *
 * Uses closure variables to track weight and timeout state.
 */
export function setupWeightBasedFlushing<
  T,
  AfterCaptureHook extends 'afterCaptureLog' | 'afterCaptureMetric',
  FlushHook extends 'flushLogs' | 'flushMetrics',
>(
  client: Client,
  afterCaptureHook: AfterCaptureHook,
  flushHook: FlushHook,
  estimateSizeFn: (item: T) => number,
  flushFn: (client: Client) => void,
): void {
  // Track weight and timeout in closure variables
  let weight = 0;
  let flushTimeout: ReturnType<typeof setTimeout> | undefined;
  let isTimerActive = false;

  // @ts-expect-error - TypeScript can't narrow generic hook types to match specific overloads, but we know this is type-safe
  client.on(flushHook, () => {
    weight = 0;
    clearTimeout(flushTimeout);
    isTimerActive = false;
  });

  // @ts-expect-error - TypeScript can't narrow generic hook types to match specific overloads, but we know this is type-safe
  client.on(afterCaptureHook, (item: T) => {
    weight += estimateSizeFn(item);

    // We flush the buffer if it exceeds 0.8 MB
    // The weight is a rough estimate, so we flush way before the payload gets too big.
    if (weight >= 800_000) {
      flushFn(client);
    } else if (!isTimerActive) {
      const flushInterval = client.getOptions()._flushInterval ?? DEFAULT_FLUSH_INTERVAL;
      if (flushInterval > 0) {
        // Only start timer if one isn't already running.
        // This prevents flushing being delayed by items that arrive close to the timeout limit
        // and thus resetting the flushing timeout and delaying items being flushed.
        isTimerActive = true;
        // Use safeUnref so the timer doesn't prevent the process from exiting
        flushTimeout = safeUnref(
          setTimeout(() => {
            flushFn(client);
            // Note: isTimerActive is reset by the flushHook handler above, not here,
            // to avoid race conditions when new items arrive during the flush.
          }, flushInterval),
        );
      }
    }
  });

  client.on('flush', () => {
    flushFn(client);
  });
}

/**
 * Estimate the size of a metric in bytes.
 *
 * @param metric - The metric to estimate the size of.
 * @returns The estimated size of the metric in bytes.
 */
export function estimateMetricSizeInBytes(metric: Metric): number {
  let weight = 0;

  // Estimate byte size of 2 bytes per character. This is a rough estimate JS strings are stored as UTF-16.
  if (metric.name) {
    weight += metric.name.length * 2;
  }

  // Add weight for number
  weight += 8;

  return weight + estimateAttributesSizeInBytes(metric.attributes);
}

/**
 * Estimate the size of a log in bytes.
 *
 * @param log - The log to estimate the size of.
 * @returns The estimated size of the log in bytes.
 */
export function estimateLogSizeInBytes(log: Log): number {
  let weight = 0;

  // Estimate byte size of 2 bytes per character. This is a rough estimate JS strings are stored as UTF-16.
  if (log.message) {
    weight += log.message.length * 2;
  }

  return weight + estimateAttributesSizeInBytes(log.attributes);
}

/**
 * Estimate the size of attributes in bytes.
 *
 * @param attributes - The attributes object to estimate the size of.
 * @returns The estimated size of the attributes in bytes.
 */
function estimateAttributesSizeInBytes(attributes: Record<string, unknown> | undefined): number {
  if (!attributes) {
    return 0;
  }

  let weight = 0;

  Object.values(attributes).forEach(value => {
    if (Array.isArray(value)) {
      weight += value.length * estimatePrimitiveSizeInBytes(value[0]);
    } else if (isPrimitive(value)) {
      weight += estimatePrimitiveSizeInBytes(value);
    } else {
      // For objects values, we estimate the size of the object as 100 bytes
      weight += 100;
    }
  });

  return weight;
}

function estimatePrimitiveSizeInBytes(value: Primitive): number {
  if (typeof value === 'string') {
    return value.length * 2;
  } else if (typeof value === 'number') {
    return 8;
  } else if (typeof value === 'boolean') {
    return 4;
  }

  return 0;
}
