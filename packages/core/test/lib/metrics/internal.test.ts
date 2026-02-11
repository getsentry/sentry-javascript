import { describe, expect, it, vi } from 'vitest';
import { Scope } from '../../../src';
import {
  _INTERNAL_captureMetric,
  _INTERNAL_flushMetricsBuffer,
  _INTERNAL_getMetricBuffer,
} from '../../../src/metrics/internal';
import type { Metric } from '../../../src/types-hoist/metric';
import * as loggerModule from '../../../src/utils/debug-logger';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

const PUBLIC_DSN = 'https://username@domain/123';

describe('_INTERNAL_captureMetric', () => {
  it('captures and sends metrics', () => {
    const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
    const client = new TestClient(options);
    const scope = new Scope();
    scope.setClient(client);

    _INTERNAL_captureMetric({ type: 'counter', name: 'test.metric', value: 1 }, { scope });
    expect(_INTERNAL_getMetricBuffer(client)).toHaveLength(1);
    expect(_INTERNAL_getMetricBuffer(client)?.[0]).toEqual(
      expect.objectContaining({
        name: 'test.metric',
        type: 'counter',
        value: 1,
        timestamp: expect.any(Number),
        trace_id: expect.any(String),
        attributes: {},
      }),
    );
  });

  it('does not capture metrics when enableMetrics is not enabled', () => {
    const logWarnSpy = vi.spyOn(loggerModule.debug, 'warn').mockImplementation(() => undefined);
    const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, enableMetrics: false });
    const client = new TestClient(options);
    const scope = new Scope();
    scope.setClient(client);

    _INTERNAL_captureMetric({ type: 'counter', name: 'test.metric', value: 1 }, { scope });

    expect(logWarnSpy).toHaveBeenCalledWith('metrics option not enabled, metric will not be captured.');
    expect(_INTERNAL_getMetricBuffer(client)).toBeUndefined();

    logWarnSpy.mockRestore();
  });

  it('includes trace context when available', () => {
    const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
    const client = new TestClient(options);
    const scope = new Scope();
    scope.setClient(client);
    scope.setPropagationContext({
      traceId: '3d9355f71e9c444b81161599adac6e29',
      sampleRand: 1,
    });

    _INTERNAL_captureMetric({ type: 'gauge', name: 'test.gauge', value: 42 }, { scope });

    expect(_INTERNAL_getMetricBuffer(client)?.[0]).toEqual(
      expect.objectContaining({
        trace_id: '3d9355f71e9c444b81161599adac6e29',
      }),
    );
  });

  it('includes release and environment in metric attributes when available', () => {
    const options = getDefaultTestClientOptions({
      dsn: PUBLIC_DSN,
      release: '1.0.0',
      environment: 'test',
    });
    const client = new TestClient(options);
    const scope = new Scope();
    scope.setClient(client);

    _INTERNAL_captureMetric({ type: 'counter', name: 'test.metric', value: 1 }, { scope });

    const metricAttributes = _INTERNAL_getMetricBuffer(client)?.[0]?.attributes;
    expect(metricAttributes).toEqual({
      'sentry.release': {
        value: '1.0.0',
        type: 'string',
      },
      'sentry.environment': {
        value: 'test',
        type: 'string',
      },
    });
  });

  it('includes SDK metadata in metric attributes when available', () => {
    const options = getDefaultTestClientOptions({
      dsn: PUBLIC_DSN,
    });
    const client = new TestClient(options);
    const scope = new Scope();
    scope.setClient(client);

    vi.spyOn(client, 'getSdkMetadata').mockReturnValue({
      sdk: {
        name: 'sentry.javascript.node',
        version: '10.0.0',
      },
    });

    _INTERNAL_captureMetric({ type: 'counter', name: 'test.metric', value: 1 }, { scope });

    const metricAttributes = _INTERNAL_getMetricBuffer(client)?.[0]?.attributes;
    expect(metricAttributes).toEqual({
      'sentry.sdk.name': {
        value: 'sentry.javascript.node',
        type: 'string',
      },
      'sentry.sdk.version': {
        value: '10.0.0',
        type: 'string',
      },
    });
  });

  it('does not include SDK metadata in metric attributes when not available', () => {
    const options = getDefaultTestClientOptions({
      dsn: PUBLIC_DSN,
    });
    const client = new TestClient(options);
    const scope = new Scope();
    scope.setClient(client);
    // Mock getSdkMetadata to return no SDK info
    vi.spyOn(client, 'getSdkMetadata').mockReturnValue({});

    _INTERNAL_captureMetric({ type: 'counter', name: 'test.metric', value: 1 }, { scope });

    const metricAttributes = _INTERNAL_getMetricBuffer(client)?.[0]?.attributes;
    expect(metricAttributes).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'sentry.sdk.name' }),
        expect.objectContaining({ key: 'sentry.sdk.version' }),
      ]),
    );
  });

  it('includes custom attributes in metric', () => {
    const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
    const client = new TestClient(options);
    const scope = new Scope();
    scope.setClient(client);

    _INTERNAL_captureMetric(
      {
        type: 'counter',
        name: 'test.metric',
        value: 1,
        attributes: { endpoint: '/api/users', method: 'GET' },
      },
      { scope },
    );

    const metricAttributes = _INTERNAL_getMetricBuffer(client)?.[0]?.attributes;
    expect(metricAttributes).toEqual({
      endpoint: {
        value: '/api/users',
        type: 'string',
      },
      method: {
        value: 'GET',
        type: 'string',
      },
    });
  });

  it('includes scope attributes in metric attributes', () => {
    const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
    const client = new TestClient(options);
    const scope = new Scope();
    scope.setClient(client);
    scope.setAttribute('scope_attribute_1', 1);
    scope.setAttributes({ scope_attribute_2: { value: 'test' }, scope_attribute_3: { value: 38, unit: 'gigabyte' } });

    _INTERNAL_captureMetric({ type: 'counter', name: 'test.metric', value: 1 }, { scope });

    const metricAttributes = _INTERNAL_getMetricBuffer(client)?.[0]?.attributes;
    expect(metricAttributes).toEqual({
      scope_attribute_1: {
        value: 1,
        type: 'integer',
      },
      scope_attribute_2: {
        value: 'test',
        type: 'string',
      },
      scope_attribute_3: {
        value: 38,
        unit: 'gigabyte',
        type: 'integer',
      },
    });
  });

  it('prefers metric attributes over scope attributes', () => {
    const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
    const client = new TestClient(options);
    const scope = new Scope();
    scope.setClient(client);
    scope.setAttribute('my-attribute', 42);

    _INTERNAL_captureMetric(
      { type: 'counter', name: 'test.metric', value: 1, attributes: { 'my-attribute': 43 } },
      { scope },
    );

    const metricAttributes = _INTERNAL_getMetricBuffer(client)?.[0]?.attributes;
    expect(metricAttributes).toEqual({
      'my-attribute': { value: 43, type: 'integer' },
    });
  });

  it('flushes metrics buffer when it reaches max size', () => {
    const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
    const client = new TestClient(options);
    const scope = new Scope();
    scope.setClient(client);

    // Fill the buffer to max size (1000 is the MAX_METRIC_BUFFER_SIZE constant)
    for (let i = 0; i < 1000; i++) {
      _INTERNAL_captureMetric({ type: 'counter', name: `metric.${i}`, value: i }, { scope });
    }

    expect(_INTERNAL_getMetricBuffer(client)).toHaveLength(1000);

    // Add one more to trigger flush
    _INTERNAL_captureMetric({ type: 'counter', name: 'trigger.flush', value: 999 }, { scope });

    // After flushing the 1000 metrics, the new metric starts a fresh buffer with 1 item
    const buffer = _INTERNAL_getMetricBuffer(client);
    expect(buffer).toHaveLength(1);
    expect(buffer?.[0]?.name).toBe('trigger.flush');
  });

  it('does not flush metrics buffer when it is empty', () => {
    const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
    const client = new TestClient(options);

    const mockSendEnvelope = vi.spyOn(client as any, 'sendEnvelope').mockImplementation(() => {});
    _INTERNAL_flushMetricsBuffer(client);
    expect(mockSendEnvelope).not.toHaveBeenCalled();
  });

  it('processes metrics through beforeSendMetric when provided', () => {
    const beforeSendMetric = vi.fn().mockImplementation(metric => ({
      ...metric,
      name: `modified.${metric.name}`,
      attributes: { ...metric.attributes, processed: true },
    }));

    const options = getDefaultTestClientOptions({
      dsn: PUBLIC_DSN,
      beforeSendMetric,
    });
    const client = new TestClient(options);
    const scope = new Scope();
    scope.setClient(client);

    _INTERNAL_captureMetric(
      {
        type: 'counter',
        name: 'original.metric',
        value: 1,
        attributes: { original: true },
      },
      { scope },
    );

    expect(beforeSendMetric).toHaveBeenCalledWith({
      type: 'counter',
      name: 'original.metric',
      value: 1,
      attributes: { original: true },
    });

    const metricBuffer = _INTERNAL_getMetricBuffer(client);
    expect(metricBuffer).toBeDefined();
    expect(metricBuffer?.[0]).toEqual(
      expect.objectContaining({
        name: 'modified.original.metric',
        attributes: {
          processed: {
            value: true,
            type: 'boolean',
          },
          original: {
            value: true,
            type: 'boolean',
          },
        },
      }),
    );
  });

  it('drops metrics when beforeSendMetric returns null', () => {
    const beforeSendMetric = vi.fn().mockReturnValue(null);
    const loggerWarnSpy = vi.spyOn(loggerModule.debug, 'log').mockImplementation(() => undefined);

    const options = getDefaultTestClientOptions({
      dsn: PUBLIC_DSN,
      beforeSendMetric,
    });
    const client = new TestClient(options);
    const scope = new Scope();
    scope.setClient(client);

    _INTERNAL_captureMetric(
      {
        type: 'counter',
        name: 'test.metric',
        value: 1,
      },
      { scope },
    );

    expect(beforeSendMetric).toHaveBeenCalled();
    expect(loggerWarnSpy).toHaveBeenCalledWith('`beforeSendMetric` returned `null`, will not send metric.');
    expect(_INTERNAL_getMetricBuffer(client)).toBeUndefined();

    loggerWarnSpy.mockRestore();
  });

  it('emits afterCaptureMetric event', () => {
    const afterCaptureMetricSpy = vi.spyOn(TestClient.prototype, 'emit');
    const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
    const client = new TestClient(options);
    const scope = new Scope();
    scope.setClient(client);

    const metric: Metric = {
      type: 'counter',
      name: 'test.metric',
      value: 1,
      attributes: {},
    };

    _INTERNAL_captureMetric(metric, { scope });

    expect(afterCaptureMetricSpy).toHaveBeenCalledWith('afterCaptureMetric', expect.objectContaining(metric));
    afterCaptureMetricSpy.mockRestore();
  });

  describe('replay integration with onlyIfSampled', () => {
    it('includes replay ID for sampled sessions', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);

      // Mock replay integration with sampled session
      const mockReplayIntegration = {
        getReplayId: vi.fn((onlyIfSampled?: boolean) => {
          return onlyIfSampled ? 'sampled-replay-id' : 'any-replay-id';
        }),
        getRecordingMode: vi.fn(() => 'session'),
      };

      vi.spyOn(client, 'getIntegrationByName').mockReturnValue(mockReplayIntegration as any);

      _INTERNAL_captureMetric({ type: 'counter', name: 'test.metric', value: 1 }, { scope });

      expect(mockReplayIntegration.getReplayId).toHaveBeenCalledWith(true);

      const metricAttributes = _INTERNAL_getMetricBuffer(client)?.[0]?.attributes;
      expect(metricAttributes).toEqual({
        'sentry.replay_id': {
          value: 'sampled-replay-id',
          type: 'string',
        },
      });
    });

    it('excludes replay ID for unsampled sessions when onlyIfSampled=true', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);

      // Mock replay integration with unsampled session
      const mockReplayIntegration = {
        getReplayId: vi.fn((onlyIfSampled?: boolean) => {
          return onlyIfSampled ? undefined : 'unsampled-replay-id';
        }),
      };

      vi.spyOn(client, 'getIntegrationByName').mockReturnValue(mockReplayIntegration as any);

      _INTERNAL_captureMetric({ type: 'counter', name: 'test.metric', value: 1 }, { scope });

      expect(mockReplayIntegration.getReplayId).toHaveBeenCalledWith(true);

      const metricAttributes = _INTERNAL_getMetricBuffer(client)?.[0]?.attributes;
      expect(metricAttributes).toEqual({});
    });

    it('includes replay ID for buffer mode sessions', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);

      // Mock replay integration with buffer mode session
      const mockReplayIntegration = {
        getReplayId: vi.fn((_onlyIfSampled?: boolean) => {
          return 'buffer-replay-id';
        }),
        getRecordingMode: vi.fn(() => 'buffer'),
      };

      vi.spyOn(client, 'getIntegrationByName').mockReturnValue(mockReplayIntegration as any);

      _INTERNAL_captureMetric({ type: 'counter', name: 'test.metric', value: 1 }, { scope });

      expect(mockReplayIntegration.getReplayId).toHaveBeenCalledWith(true);

      const metricAttributes = _INTERNAL_getMetricBuffer(client)?.[0]?.attributes;
      expect(metricAttributes).toEqual({
        'sentry.replay_id': {
          value: 'buffer-replay-id',
          type: 'string',
        },
        'sentry._internal.replay_is_buffering': {
          value: true,
          type: 'boolean',
        },
      });
    });

    it('handles missing replay integration gracefully', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);

      // Mock no replay integration found
      vi.spyOn(client, 'getIntegrationByName').mockReturnValue(undefined);

      _INTERNAL_captureMetric({ type: 'counter', name: 'test.metric', value: 1 }, { scope });

      const metricAttributes = _INTERNAL_getMetricBuffer(client)?.[0]?.attributes;
      expect(metricAttributes).toEqual({});
    });

    it('combines replay ID with other metric attributes', () => {
      const options = getDefaultTestClientOptions({
        dsn: PUBLIC_DSN,

        release: '1.0.0',
        environment: 'test',
      });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);

      // Mock replay integration
      const mockReplayIntegration = {
        getReplayId: vi.fn(() => 'test-replay-id'),
        getRecordingMode: vi.fn(() => 'session'),
      };

      vi.spyOn(client, 'getIntegrationByName').mockReturnValue(mockReplayIntegration as any);

      _INTERNAL_captureMetric(
        {
          type: 'counter',
          name: 'test.metric',
          value: 1,
          attributes: { endpoint: '/api/users', method: 'GET' },
        },
        { scope },
      );

      const metricAttributes = _INTERNAL_getMetricBuffer(client)?.[0]?.attributes;
      expect(metricAttributes).toEqual({
        endpoint: {
          value: '/api/users',
          type: 'string',
        },
        method: {
          value: 'GET',
          type: 'string',
        },
        'sentry.release': {
          value: '1.0.0',
          type: 'string',
        },
        'sentry.environment': {
          value: 'test',
          type: 'string',
        },
        'sentry.replay_id': {
          value: 'test-replay-id',
          type: 'string',
        },
      });
    });

    it('does not set replay ID attribute when getReplayId returns null or undefined', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);

      const testCases = [null, undefined];

      testCases.forEach(returnValue => {
        // Clear buffer for each test
        _INTERNAL_getMetricBuffer(client)?.splice(0);

        const mockReplayIntegration = {
          getReplayId: vi.fn(() => returnValue),
        };

        vi.spyOn(client, 'getIntegrationByName').mockReturnValue(mockReplayIntegration as any);

        _INTERNAL_captureMetric({ type: 'counter', name: 'test.metric', value: 1 }, { scope });

        const metricAttributes = _INTERNAL_getMetricBuffer(client)?.[0]?.attributes;
        expect(metricAttributes).toEqual({});
        expect(metricAttributes).not.toHaveProperty('sentry.replay_id');
      });
    });

    it('sets replay_is_buffering attribute when replay is in buffer mode', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);

      // Mock replay integration with buffer mode
      const mockReplayIntegration = {
        getReplayId: vi.fn(() => 'buffer-replay-id'),
        getRecordingMode: vi.fn(() => 'buffer'),
      };

      vi.spyOn(client, 'getIntegrationByName').mockReturnValue(mockReplayIntegration as any);

      _INTERNAL_captureMetric({ type: 'counter', name: 'test.metric', value: 1 }, { scope });

      expect(mockReplayIntegration.getReplayId).toHaveBeenCalledWith(true);
      expect(mockReplayIntegration.getRecordingMode).toHaveBeenCalled();

      const metricAttributes = _INTERNAL_getMetricBuffer(client)?.[0]?.attributes;
      expect(metricAttributes).toEqual({
        'sentry.replay_id': {
          value: 'buffer-replay-id',
          type: 'string',
        },
        'sentry._internal.replay_is_buffering': {
          value: true,
          type: 'boolean',
        },
      });
    });

    it('does not set replay_is_buffering attribute when replay is in session mode', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);

      // Mock replay integration with session mode
      const mockReplayIntegration = {
        getReplayId: vi.fn(() => 'session-replay-id'),
        getRecordingMode: vi.fn(() => 'session'),
      };

      vi.spyOn(client, 'getIntegrationByName').mockReturnValue(mockReplayIntegration as any);

      _INTERNAL_captureMetric({ type: 'counter', name: 'test.metric', value: 1 }, { scope });

      expect(mockReplayIntegration.getReplayId).toHaveBeenCalledWith(true);
      expect(mockReplayIntegration.getRecordingMode).toHaveBeenCalled();

      const metricAttributes = _INTERNAL_getMetricBuffer(client)?.[0]?.attributes;
      expect(metricAttributes).toEqual({
        'sentry.replay_id': {
          value: 'session-replay-id',
          type: 'string',
        },
      });
      expect(metricAttributes).not.toHaveProperty('sentry._internal.replay_is_buffering');
    });

    it('does not set replay_is_buffering attribute when replay is undefined mode', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);

      // Mock replay integration with undefined mode (replay stopped/disabled)
      const mockReplayIntegration = {
        getReplayId: vi.fn(() => 'stopped-replay-id'),
        getRecordingMode: vi.fn(() => undefined),
      };

      vi.spyOn(client, 'getIntegrationByName').mockReturnValue(mockReplayIntegration as any);

      _INTERNAL_captureMetric({ type: 'counter', name: 'test.metric', value: 1 }, { scope });

      expect(mockReplayIntegration.getReplayId).toHaveBeenCalledWith(true);
      expect(mockReplayIntegration.getRecordingMode).toHaveBeenCalled();

      const metricAttributes = _INTERNAL_getMetricBuffer(client)?.[0]?.attributes;
      expect(metricAttributes).toEqual({
        'sentry.replay_id': {
          value: 'stopped-replay-id',
          type: 'string',
        },
      });
      expect(metricAttributes).not.toHaveProperty('sentry._internal.replay_is_buffering');
    });

    it('does not set replay_is_buffering attribute when no replay ID is available', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);

      // Mock replay integration that returns no replay ID but has buffer mode
      const mockReplayIntegration = {
        getReplayId: vi.fn(() => undefined),
        getRecordingMode: vi.fn(() => 'buffer'),
      };

      vi.spyOn(client, 'getIntegrationByName').mockReturnValue(mockReplayIntegration as any);

      _INTERNAL_captureMetric({ type: 'counter', name: 'test.metric', value: 1 }, { scope });

      expect(mockReplayIntegration.getReplayId).toHaveBeenCalledWith(true);
      // getRecordingMode should not be called if there's no replay ID
      expect(mockReplayIntegration.getRecordingMode).not.toHaveBeenCalled();

      const metricAttributes = _INTERNAL_getMetricBuffer(client)?.[0]?.attributes;
      expect(metricAttributes).toEqual({});
      expect(metricAttributes).not.toHaveProperty('sentry.replay_id');
      expect(metricAttributes).not.toHaveProperty('sentry._internal.replay_is_buffering');
    });

    it('does not set replay_is_buffering attribute when replay integration is missing', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);

      // Mock no replay integration found
      vi.spyOn(client, 'getIntegrationByName').mockReturnValue(undefined);

      _INTERNAL_captureMetric({ type: 'counter', name: 'test.metric', value: 1 }, { scope });

      const metricAttributes = _INTERNAL_getMetricBuffer(client)?.[0]?.attributes;
      expect(metricAttributes).toEqual({});
      expect(metricAttributes).not.toHaveProperty('sentry.replay_id');
      expect(metricAttributes).not.toHaveProperty('sentry._internal.replay_is_buffering');
    });

    it('combines replay_is_buffering with other replay attributes', () => {
      const options = getDefaultTestClientOptions({
        dsn: PUBLIC_DSN,

        release: '1.0.0',
        environment: 'test',
      });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);

      // Mock replay integration with buffer mode
      const mockReplayIntegration = {
        getReplayId: vi.fn(() => 'buffer-replay-id'),
        getRecordingMode: vi.fn(() => 'buffer'),
      };

      vi.spyOn(client, 'getIntegrationByName').mockReturnValue(mockReplayIntegration as any);

      _INTERNAL_captureMetric(
        {
          type: 'counter',
          name: 'test.metric',
          value: 1,
          attributes: { endpoint: '/api/users', method: 'GET' },
        },
        { scope },
      );

      const metricAttributes = _INTERNAL_getMetricBuffer(client)?.[0]?.attributes;
      expect(metricAttributes).toEqual({
        endpoint: {
          value: '/api/users',
          type: 'string',
        },
        method: {
          value: 'GET',
          type: 'string',
        },
        'sentry.release': {
          value: '1.0.0',
          type: 'string',
        },
        'sentry.environment': {
          value: 'test',
          type: 'string',
        },
        'sentry.replay_id': {
          value: 'buffer-replay-id',
          type: 'string',
        },
        'sentry._internal.replay_is_buffering': {
          value: true,
          type: 'boolean',
        },
      });
    });
  });

  describe('user functionality', () => {
    it('includes user data in metric attributes', () => {
      const options = getDefaultTestClientOptions({
        dsn: PUBLIC_DSN,
      });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);
      scope.setUser({
        id: '123',
        email: 'user@example.com',
        username: 'testuser',
      });

      _INTERNAL_captureMetric({ type: 'counter', name: 'test.metric', value: 1 }, { scope });

      const metricAttributes = _INTERNAL_getMetricBuffer(client)?.[0]?.attributes;
      expect(metricAttributes).toEqual({
        'user.id': {
          value: '123',
          type: 'string',
        },
        'user.email': {
          value: 'user@example.com',
          type: 'string',
        },
        'user.name': {
          value: 'testuser',
          type: 'string',
        },
      });
    });

    it('includes partial user data when only some fields are available', () => {
      const options = getDefaultTestClientOptions({
        dsn: PUBLIC_DSN,
      });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);
      scope.setUser({
        id: '123',
        // email and username are missing
      });

      _INTERNAL_captureMetric({ type: 'counter', name: 'test.metric', value: 1 }, { scope });

      const metricAttributes = _INTERNAL_getMetricBuffer(client)?.[0]?.attributes;
      expect(metricAttributes).toEqual({
        'user.id': {
          value: '123',
          type: 'string',
        },
      });
    });

    it('includes user email and username without id', () => {
      const options = getDefaultTestClientOptions({
        dsn: PUBLIC_DSN,
      });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);
      scope.setUser({
        email: 'user@example.com',
        username: 'testuser',
        // id is missing
      });

      _INTERNAL_captureMetric({ type: 'counter', name: 'test.metric', value: 1 }, { scope });

      const metricAttributes = _INTERNAL_getMetricBuffer(client)?.[0]?.attributes;
      expect(metricAttributes).toEqual({
        'user.email': {
          value: 'user@example.com',
          type: 'string',
        },
        'user.name': {
          value: 'testuser',
          type: 'string',
        },
      });
    });

    it('does not include user data when user object is empty', () => {
      const options = getDefaultTestClientOptions({
        dsn: PUBLIC_DSN,
      });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);
      scope.setUser({});

      _INTERNAL_captureMetric({ type: 'counter', name: 'test.metric', value: 1 }, { scope });

      const metricAttributes = _INTERNAL_getMetricBuffer(client)?.[0]?.attributes;
      expect(metricAttributes).toEqual({});
    });

    it('combines user data with other metric attributes', () => {
      const options = getDefaultTestClientOptions({
        dsn: PUBLIC_DSN,

        release: '1.0.0',
        environment: 'test',
      });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);
      scope.setUser({
        id: '123',
        email: 'user@example.com',
      });

      _INTERNAL_captureMetric(
        {
          type: 'counter',
          name: 'test.metric',
          value: 1,
          attributes: { endpoint: '/api/users', method: 'GET' },
        },
        { scope },
      );

      const metricAttributes = _INTERNAL_getMetricBuffer(client)?.[0]?.attributes;
      expect(metricAttributes).toEqual({
        endpoint: {
          value: '/api/users',
          type: 'string',
        },
        method: {
          value: 'GET',
          type: 'string',
        },
        'user.id': {
          value: '123',
          type: 'string',
        },
        'user.email': {
          value: 'user@example.com',
          type: 'string',
        },
        'sentry.release': {
          value: '1.0.0',
          type: 'string',
        },
        'sentry.environment': {
          value: 'test',
          type: 'string',
        },
      });
    });

    it('handles user data with non-string values', () => {
      const options = getDefaultTestClientOptions({
        dsn: PUBLIC_DSN,
      });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);
      scope.setUser({
        id: 123,
        email: 'user@example.com',
        username: undefined,
      });

      _INTERNAL_captureMetric({ type: 'counter', name: 'test.metric', value: 1 }, { scope });

      const metricAttributes = _INTERNAL_getMetricBuffer(client)?.[0]?.attributes;
      expect(metricAttributes).toEqual({
        'user.id': {
          value: 123,
          type: 'integer',
        },
        'user.email': {
          value: 'user@example.com',
          type: 'string',
        },
      });
    });

    it('preserves existing user attributes in metric and does not override them', () => {
      const options = getDefaultTestClientOptions({
        dsn: PUBLIC_DSN,
      });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);
      scope.setUser({
        id: '123',
        email: 'user@example.com',
      });

      _INTERNAL_captureMetric(
        {
          type: 'counter',
          name: 'test.metric',
          value: 1,
          attributes: {
            'user.id': 'existing-id',
            'user.custom': 'custom-value',
          },
        },
        { scope },
      );

      const metricAttributes = _INTERNAL_getMetricBuffer(client)?.[0]?.attributes;
      expect(metricAttributes).toEqual({
        'user.custom': {
          value: 'custom-value',
          type: 'string',
        },
        'user.id': {
          value: 'existing-id',
          type: 'string',
        },
        'user.email': {
          value: 'user@example.com',
          type: 'string',
        },
      });
    });

    it('only adds scope user data for attributes that do not already exist', () => {
      const options = getDefaultTestClientOptions({
        dsn: PUBLIC_DSN,
      });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);
      scope.setUser({
        id: 'scope-id',
        email: 'scope@example.com',
        username: 'scope-user',
      });

      _INTERNAL_captureMetric(
        {
          type: 'counter',
          name: 'test.metric',
          value: 1,
          attributes: {
            'user.email': 'existing@example.com',
            'other.attr': 'value',
          },
        },
        { scope },
      );

      const metricAttributes = _INTERNAL_getMetricBuffer(client)?.[0]?.attributes;
      expect(metricAttributes).toEqual({
        'other.attr': {
          value: 'value',
          type: 'string',
        },
        'user.email': {
          value: 'existing@example.com',
          type: 'string',
        },
        'user.id': {
          value: 'scope-id',
          type: 'string',
        },
        'user.name': {
          value: 'scope-user',
          type: 'string',
        },
      });
    });
  });

  it('overrides user-provided system attributes with SDK values', () => {
    const options = getDefaultTestClientOptions({
      dsn: PUBLIC_DSN,

      release: 'sdk-release-1.0.0',
      environment: 'sdk-environment',
    });
    const client = new TestClient(options);
    vi.spyOn(client, 'getSdkMetadata').mockReturnValue({
      sdk: {
        name: 'sentry.javascript.node',
        version: '10.0.0',
      },
    });

    const scope = new Scope();
    scope.setClient(client);

    _INTERNAL_captureMetric(
      {
        type: 'counter',
        name: 'test.metric',
        value: 1,
        attributes: {
          'sentry.release': 'user-release-2.0.0',
          'sentry.environment': 'user-environment',
          'sentry.sdk.name': 'user-sdk-name',
          'sentry.sdk.version': 'user-sdk-version',
          'user.custom': 'preserved-value',
        },
      },
      { scope },
    );

    const metricAttributes = _INTERNAL_getMetricBuffer(client)?.[0]?.attributes;
    expect(metricAttributes).toEqual({
      'user.custom': {
        value: 'preserved-value',
        type: 'string',
      },
      'sentry.release': {
        value: 'sdk-release-1.0.0',
        type: 'string',
      },
      'sentry.environment': {
        value: 'sdk-environment',
        type: 'string',
      },
      'sentry.sdk.name': {
        value: 'sentry.javascript.node',
        type: 'string',
      },
      'sentry.sdk.version': {
        value: '10.0.0',
        type: 'string',
      },
    });
  });
});
