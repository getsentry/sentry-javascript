import { metrics } from '@sentry/core';
import type { AttributeValue, Counter, Gauge, Histogram, Meter, MetricOptions } from './types';

function toMetricAttributes(
  attributes?: Record<string, AttributeValue>,
): Record<string, string | number | boolean> | undefined {
  if (!attributes) {
    return undefined;
  }
  const result: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      result[key] = value;
    }
  }
  return result;
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

export class SentryBullMQMeter implements Meter {
  public createCounter(name: string, options?: MetricOptions): Counter {
    return new SentryBullMQCounter(name, options?.unit);
  }

  public createHistogram(name: string, options?: MetricOptions): Histogram {
    return new SentryBullMQHistogram(name, options?.unit);
  }

  public createGauge(name: string, options?: MetricOptions): Gauge {
    return new SentryBullMQGauge(name, options?.unit);
  }
}
