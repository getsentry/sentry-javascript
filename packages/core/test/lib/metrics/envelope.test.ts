import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMetricContainerEnvelopeItem, createMetricEnvelope } from '../../../src/metrics/envelope';
import type { DsnComponents } from '../../../src/types-hoist/dsn';
import type { SerializedMetric } from '../../../src/types-hoist/metric';
import type { SdkMetadata } from '../../../src/types-hoist/sdkmetadata';
import * as utilsDsn from '../../../src/utils/dsn';
import * as utilsEnvelope from '../../../src/utils/envelope';
import { isBrowser } from '../../../src/utils/isBrowser';

vi.mock('../../../src/utils/dsn', () => ({
  dsnToString: vi.fn(dsn => `https://${dsn.publicKey}@${dsn.host}/`),
}));
vi.mock('../../../src/utils/envelope', () => ({
  createEnvelope: vi.fn((_headers, items) => [_headers, items]),
}));
vi.mock('../../../src/utils/isBrowser', () => ({
  isBrowser: vi.fn(() => false),
}));

afterEach(() => {
  vi.mocked(isBrowser).mockReturnValue(false);
});

describe('createMetricContainerEnvelopeItem', () => {
  it('emits version: 2 without ingest_settings when not in browser', () => {
    const mockMetric: SerializedMetric = {
      timestamp: 1713859200,
      trace_id: '3d9355f71e9c444b81161599adac6e29',
      span_id: '8b5f5e5e5e5e5e5e',
      name: 'test.metric',
      type: 'counter',
      value: 1,
      unit: 'count',
      attributes: {},
    };

    const result = createMetricContainerEnvelopeItem([mockMetric], true);

    expect(result[0]).toEqual({
      type: 'trace_metric',
      item_count: 1,
      content_type: 'application/vnd.sentry.items.trace-metric+json',
    });
    expect(result[1]).toEqual({
      version: 2,
      items: [mockMetric],
    });
  });

  it("includes ingest_settings with 'auto' values when in browser and inferUserData is true", () => {
    vi.mocked(isBrowser).mockReturnValue(true);

    const mockMetric: SerializedMetric = {
      timestamp: 1713859200,
      trace_id: '3d9355f71e9c444b81161599adac6e29',
      span_id: '8b5f5e5e5e5e5e5e',
      name: 'test.metric',
      type: 'counter',
      value: 1,
      unit: 'count',
      attributes: {},
    };

    const result = createMetricContainerEnvelopeItem([mockMetric], true);

    expect(result[1]).toEqual({
      version: 2,
      ingest_settings: { infer_ip: 'auto', infer_user_agent: 'auto' },
      items: [mockMetric],
    });
  });

  it("includes ingest_settings with 'never' values when in browser and inferUserData is false", () => {
    vi.mocked(isBrowser).mockReturnValue(true);

    const mockMetric: SerializedMetric = {
      timestamp: 1713859200,
      trace_id: '3d9355f71e9c444b81161599adac6e29',
      span_id: '8b5f5e5e5e5e5e5e',
      name: 'test.metric',
      type: 'counter',
      value: 1,
      unit: 'count',
      attributes: {},
    };

    const result = createMetricContainerEnvelopeItem([mockMetric], false);

    expect(result[1]).toEqual({
      version: 2,
      ingest_settings: { infer_ip: 'never', infer_user_agent: 'never' },
      items: [mockMetric],
    });
  });
});

describe('createMetricEnvelope', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2023-01-01T12:00:00Z'));

    // Reset mocks
    vi.mocked(utilsEnvelope.createEnvelope).mockClear();
    vi.mocked(utilsDsn.dsnToString).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates an envelope with basic headers', () => {
    const mockMetrics: SerializedMetric[] = [
      {
        timestamp: 1713859200,
        trace_id: '3d9355f71e9c444b81161599adac6e29',
        span_id: '8b5f5e5e5e5e5e5e',
        name: 'test.metric',
        type: 'counter',
        value: 1,
        unit: 'count',
        attributes: {},
      },
    ];

    const result = createMetricEnvelope(mockMetrics);

    expect(result[0]).toEqual({});

    expect(utilsEnvelope.createEnvelope).toHaveBeenCalledWith({}, expect.any(Array));
  });

  it('includes SDK info when metadata is provided', () => {
    const mockMetrics: SerializedMetric[] = [
      {
        timestamp: 1713859200,
        trace_id: '3d9355f71e9c444b81161599adac6e29',
        span_id: '8b5f5e5e5e5e5e5e',
        name: 'test.metric',
        type: 'counter',
        value: 1,
        unit: 'count',
        attributes: {},
      },
    ];

    const metadata: SdkMetadata = {
      sdk: {
        name: 'sentry.javascript.node',
        version: '10.0.0',
      },
    };

    const result = createMetricEnvelope(mockMetrics, metadata);

    expect(result[0]).toEqual({
      sdk: {
        name: 'sentry.javascript.node',
        version: '10.0.0',
      },
    });
  });

  it('includes DSN when tunnel and DSN are provided', () => {
    const mockMetrics: SerializedMetric[] = [
      {
        timestamp: 1713859200,
        trace_id: '3d9355f71e9c444b81161599adac6e29',
        span_id: '8b5f5e5e5e5e5e5e',
        name: 'test.metric',
        type: 'counter',
        value: 1,
        unit: 'count',
        attributes: {},
      },
    ];

    const dsn: DsnComponents = {
      host: 'example.sentry.io',
      path: '/',
      projectId: '123',
      port: '',
      protocol: 'https',
      publicKey: 'abc123',
    };

    const result = createMetricEnvelope(mockMetrics, undefined, 'https://tunnel.example.com', dsn);

    expect(result[0]).toHaveProperty('dsn');
    expect(utilsDsn.dsnToString).toHaveBeenCalledWith(dsn);
  });

  it('maps each metric to an envelope item', () => {
    const mockMetrics: SerializedMetric[] = [
      {
        timestamp: 1713859200,
        trace_id: '3d9355f71e9c444b81161599adac6e29',
        span_id: '8b5f5e5e5e5e5e5e',
        name: 'first.metric',
        type: 'counter',
        value: 1,
        unit: 'count',
        attributes: {},
      },
      {
        timestamp: 1713859201,
        trace_id: '3d9355f71e9c444b81161599adac6e29',
        span_id: '8b5f5e5e5e5e5e5e',
        name: 'second.metric',
        type: 'gauge',
        value: 42,
        unit: 'bytes',
        attributes: {},
      },
    ];

    createMetricEnvelope(mockMetrics);

    // Check that createEnvelope was called with a single container item containing all metrics
    expect(utilsEnvelope.createEnvelope).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([
        expect.arrayContaining([
          { type: 'trace_metric', item_count: 2, content_type: 'application/vnd.sentry.items.trace-metric+json' },
          { version: 2, items: mockMetrics },
        ]),
      ]),
    );
  });
});
