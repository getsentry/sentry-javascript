import { MESSAGING_OPERATION_NAME, MESSAGING_SYSTEM } from '@sentry/conventions/attributes';
import { metrics } from '@sentry/core';
import { toMessagingKey, toSentryAttributes } from './span';
import type { AttributeValue, Counter, Gauge, Histogram, Meter, MetricOptions } from './types';

function toMetricAttributes(
  attributes?: Record<string, AttributeValue>,
): Record<string, string | number | boolean> | undefined {
  if (!attributes) {
    return undefined;
  }
  const result: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(toSentryAttributes(attributes))) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Converts the OpenTelemetry (UCUM) unit that BullMQ passes to the matching Sentry unit.
 */
function toSentryUnit(unit?: string): string | undefined {
  if (unit === 'ms') {
    return 'millisecond';
  }

  // In UCUM, `1` and annotations such as `{jobs}` mark a value without a unit.
  if (unit === '1' || unit?.startsWith('{')) {
    return 'none';
  }

  return unit;
}

class SentryBullMQCounter implements Counter {
  private _name: string;
  private _unit?: string;

  public constructor(name: string, unit?: string) {
    this._name = name;
    this._unit = unit;
  }

  public add(value: number, attributes?: Record<string, AttributeValue>): void {
    metrics.count(this._name, value, {
      unit: this._unit,
      attributes: toMetricAttributes(attributes),
    });
  }
}

class SentryBullMQHistogram implements Histogram {
  private _name: string;
  private _unit?: string;

  public constructor(name: string, unit?: string) {
    this._name = name;
    this._unit = unit;
  }

  public record(value: number, attributes?: Record<string, AttributeValue>): void {
    metrics.distribution(this._name, value, {
      unit: this._unit,
      attributes: toMetricAttributes(attributes),
    });
  }
}

class SentryBullMQGauge implements Gauge {
  private _name: string;
  private _unit?: string;

  public constructor(name: string, unit?: string) {
    this._name = name;
    this._unit = unit;
  }

  public record(value: number, attributes?: Record<string, AttributeValue>): void {
    metrics.gauge(this._name, value, {
      unit: this._unit,
      attributes: toMetricAttributes(attributes),
    });
  }
}

/**
 * Records BullMQ's `bullmq.job.duration` histogram, which is in milliseconds, as the OTel
 * `messaging.process.duration` metric in seconds.
 */
class SentryBullMQProcessDuration implements Histogram {
  public record(value: number, attributes?: Record<string, AttributeValue>): void {
    metrics.distribution('messaging.process.duration', value / 1000, {
      unit: 'second',
      attributes: {
        ...toMetricAttributes(attributes),
        [MESSAGING_SYSTEM]: 'bullmq',
        [MESSAGING_OPERATION_NAME]: 'process',
      },
    });
  }
}

export class SentryBullMQMeter implements Meter {
  public createCounter(name: string, options?: MetricOptions): Counter {
    return new SentryBullMQCounter(toMessagingKey(name), toSentryUnit(options?.unit));
  }

  public createHistogram(name: string, options?: MetricOptions): Histogram {
    if (name === 'bullmq.job.duration') {
      return new SentryBullMQProcessDuration();
    }

    return new SentryBullMQHistogram(toMessagingKey(name), toSentryUnit(options?.unit));
  }

  public createGauge(name: string, options?: MetricOptions): Gauge {
    return new SentryBullMQGauge(toMessagingKey(name), toSentryUnit(options?.unit));
  }
}
