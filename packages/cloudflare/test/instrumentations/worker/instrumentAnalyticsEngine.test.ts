import type { AnalyticsEngineDataset } from '@cloudflare/workers-types';
import * as SentryCore from '@sentry/core';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { instrumentAnalyticsEngineWithSentry } from '../../../src/instrumentations/worker/instrumentAnalyticsEngine';

function createMockDataset(): AnalyticsEngineDataset {
  return {
    writeDataPoint: vi.fn(),
  } as unknown as AnalyticsEngineDataset;
}

describe('instrumentAnalyticsEngineWithSentry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('forwards the call to the underlying dataset', () => {
    const dataset = createMockDataset();
    const wrapped = instrumentAnalyticsEngineWithSentry(dataset, 'MY_AE');

    wrapped.writeDataPoint({ indexes: ['idx'], doubles: [1.5], blobs: ['blob'] });

    expect(dataset.writeDataPoint).toHaveBeenCalledTimes(1);
    expect(dataset.writeDataPoint).toHaveBeenCalledWith({ indexes: ['idx'], doubles: [1.5], blobs: ['blob'] });
  });

  test('forwards call without arguments', () => {
    const dataset = createMockDataset();
    const wrapped = instrumentAnalyticsEngineWithSentry(dataset, 'MY_AE');

    wrapped.writeDataPoint();

    expect(dataset.writeDataPoint).toHaveBeenCalledTimes(1);
  });

  test('starts a span with correct attributes and binding name', () => {
    const startSpanSpy = vi.spyOn(SentryCore, 'startSpan');
    const dataset = createMockDataset();
    const wrapped = instrumentAnalyticsEngineWithSentry(dataset, 'MY_AE');

    wrapped.writeDataPoint({ doubles: [42] });

    expect(startSpanSpy).toHaveBeenCalledTimes(1);
    const [spanCtx] = startSpanSpy.mock.calls[0]!;
    expect(spanCtx).toMatchObject({
      op: 'cloudflare.analytics_engine',
      name: 'writeDataPoint MY_AE',
      attributes: {
        'cloudflare.analytics_engine.binding_name': 'MY_AE',
        'sentry.op': 'cloudflare.analytics_engine',
        'sentry.origin': 'auto.cloudflare.analytics_engine',
      },
    });
  });

  test('uses generic name when no binding name provided', () => {
    const startSpanSpy = vi.spyOn(SentryCore, 'startSpan');
    const dataset = createMockDataset();
    const wrapped = instrumentAnalyticsEngineWithSentry(dataset);

    wrapped.writeDataPoint();

    const [spanCtx] = startSpanSpy.mock.calls[0]!;
    expect(spanCtx.name).toBe('writeDataPoint');
    expect(spanCtx.attributes!['cloudflare.analytics_engine.binding_name']).toBeUndefined();
  });

  test('forwards unknown property accesses transparently', () => {
    const dataset = Object.assign(createMockDataset(), {
      customProp: 'hello',
    }) as unknown as AnalyticsEngineDataset & { customProp: string };

    const wrapped = instrumentAnalyticsEngineWithSentry(dataset, 'MY_AE') as AnalyticsEngineDataset & {
      customProp: string;
    };
    expect(wrapped.customProp).toBe('hello');
  });
});
