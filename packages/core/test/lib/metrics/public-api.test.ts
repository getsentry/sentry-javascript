import { describe, expect, it } from 'vitest';
import { Scope } from '../../../src';
import { _INTERNAL_getMetricBuffer } from '../../../src/metrics/internal';
import { count, distribution, gauge } from '../../../src/metrics/public-api';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

const PUBLIC_DSN = 'https://username@domain/123';

describe('Metrics Public API', () => {
  describe('count', () => {
    it('captures a counter metric with default value of 1', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);

      count('api.requests', undefined, { scope });

      const metricBuffer = _INTERNAL_getMetricBuffer(client);
      expect(metricBuffer).toHaveLength(1);
      expect(metricBuffer?.[0]).toEqual(
        expect.objectContaining({
          name: 'api.requests',
          type: 'counter',
          value: 1,
        }),
      );
    });

    it('captures a counter metric with custom value', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);

      count('items.processed', 5, { scope });

      const metricBuffer = _INTERNAL_getMetricBuffer(client);
      expect(metricBuffer).toHaveLength(1);
      expect(metricBuffer?.[0]).toEqual(
        expect.objectContaining({
          name: 'items.processed',
          type: 'counter',
          value: 5,
        }),
      );
    });

    it('captures a counter metric with attributes', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);

      count('api.requests', 1, {
        scope,
        attributes: {
          endpoint: '/api/users',
          method: 'GET',
          status: 200,
        },
      });

      const metricBuffer = _INTERNAL_getMetricBuffer(client);
      expect(metricBuffer).toHaveLength(1);
      expect(metricBuffer?.[0]).toEqual(
        expect.objectContaining({
          name: 'api.requests',
          type: 'counter',
          value: 1,
          attributes: {
            endpoint: {
              value: '/api/users',
              type: 'string',
            },
            method: {
              value: 'GET',
              type: 'string',
            },
            status: {
              value: 200,
              type: 'integer',
            },
          },
        }),
      );
    });

    it('captures a counter metric with unit', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);

      count('data.uploaded', 1024, {
        scope,
        unit: 'byte',
      });

      const metricBuffer = _INTERNAL_getMetricBuffer(client);
      expect(metricBuffer).toHaveLength(1);
      expect(metricBuffer?.[0]).toEqual(
        expect.objectContaining({
          name: 'data.uploaded',
          type: 'counter',
          value: 1024,
          unit: 'byte',
        }),
      );
    });

    it('does not capture counter when enableMetrics is not enabled', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, enableMetrics: false });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);

      count('api.requests', 1, { scope });

      expect(_INTERNAL_getMetricBuffer(client)).toBeUndefined();
    });
  });

  describe('gauge', () => {
    it('captures a gauge metric', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);

      gauge('memory.usage', 1024, { scope });

      const metricBuffer = _INTERNAL_getMetricBuffer(client);
      expect(metricBuffer).toHaveLength(1);
      expect(metricBuffer?.[0]).toEqual(
        expect.objectContaining({
          name: 'memory.usage',
          type: 'gauge',
          value: 1024,
        }),
      );
    });

    it('captures a gauge metric with unit', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);

      gauge('memory.usage', 1024, {
        scope,
        unit: 'megabyte',
      });

      const metricBuffer = _INTERNAL_getMetricBuffer(client);
      expect(metricBuffer).toHaveLength(1);
      expect(metricBuffer?.[0]).toEqual(
        expect.objectContaining({
          name: 'memory.usage',
          type: 'gauge',
          value: 1024,
          unit: 'megabyte',
        }),
      );
    });

    it('captures a gauge metric with attributes', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);

      gauge('active.connections', 42, {
        scope,
        attributes: {
          server: 'api-1',
          protocol: 'websocket',
        },
      });

      const metricBuffer = _INTERNAL_getMetricBuffer(client);
      expect(metricBuffer).toHaveLength(1);
      expect(metricBuffer?.[0]).toEqual(
        expect.objectContaining({
          name: 'active.connections',
          type: 'gauge',
          value: 42,
          attributes: {
            server: {
              value: 'api-1',
              type: 'string',
            },
            protocol: {
              value: 'websocket',
              type: 'string',
            },
          },
        }),
      );
    });

    it('does not capture gauge when enableMetrics is not enabled', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, enableMetrics: false });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);

      gauge('memory.usage', 1024, { scope });

      expect(_INTERNAL_getMetricBuffer(client)).toBeUndefined();
    });
  });

  describe('distribution', () => {
    it('captures a distribution metric', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);

      distribution('task.duration', 500, { scope });

      const metricBuffer = _INTERNAL_getMetricBuffer(client);
      expect(metricBuffer).toHaveLength(1);
      expect(metricBuffer?.[0]).toEqual(
        expect.objectContaining({
          name: 'task.duration',
          type: 'distribution',
          value: 500,
        }),
      );
    });

    it('captures a distribution metric with unit', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);

      distribution('task.duration', 500, {
        scope,
        unit: 'millisecond',
      });

      const metricBuffer = _INTERNAL_getMetricBuffer(client);
      expect(metricBuffer).toHaveLength(1);
      expect(metricBuffer?.[0]).toEqual(
        expect.objectContaining({
          name: 'task.duration',
          type: 'distribution',
          value: 500,
          unit: 'millisecond',
        }),
      );
    });

    it('captures a distribution metric with attributes', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);

      distribution('batch.size', 100, {
        scope,
        attributes: {
          processor: 'batch-1',
          type: 'async',
        },
      });

      const metricBuffer = _INTERNAL_getMetricBuffer(client);
      expect(metricBuffer).toHaveLength(1);
      expect(metricBuffer?.[0]).toEqual(
        expect.objectContaining({
          name: 'batch.size',
          type: 'distribution',
          value: 100,
          attributes: {
            processor: {
              value: 'batch-1',
              type: 'string',
            },
            type: {
              value: 'async',
              type: 'string',
            },
          },
        }),
      );
    });

    it('does not capture distribution when enableMetrics is not enabled', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN, enableMetrics: false });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);

      distribution('task.duration', 500, { scope });

      expect(_INTERNAL_getMetricBuffer(client)).toBeUndefined();
    });
  });

  describe('mixed metric types', () => {
    it('captures multiple different metric types', () => {
      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      const client = new TestClient(options);
      const scope = new Scope();
      scope.setClient(client);

      count('api.requests', 1, { scope });
      gauge('memory.usage', 1024, { scope });
      distribution('task.duration', 500, { scope });

      const metricBuffer = _INTERNAL_getMetricBuffer(client);
      expect(metricBuffer).toHaveLength(3);
      expect(metricBuffer?.[0]).toEqual(
        expect.objectContaining({
          name: 'api.requests',
          type: 'counter',
        }),
      );
      expect(metricBuffer?.[1]).toEqual(
        expect.objectContaining({
          name: 'memory.usage',
          type: 'gauge',
        }),
      );
      expect(metricBuffer?.[2]).toEqual(
        expect.objectContaining({
          name: 'task.duration',
          type: 'distribution',
        }),
      );
    });
  });
});
