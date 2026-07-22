import * as os from 'node:os';
import type { StreamedSpanJSON } from '@sentry/core';
import { afterAll, describe, expect, it, vi } from 'vitest';
import {
  contextsToSpanAttributes,
  getAppContext,
  getDeviceContext,
  getDynamicSpanAttributes,
  nodeContextIntegration,
} from '../../src/integrations/context';
import { conditionalTest } from '../helpers/conditional';

vi.mock('node:os', async () => {
  const original = await vi.importActual('node:os');
  return {
    ...original,
    uptime: original.uptime,
  };
});

describe('Context', () => {
  describe('getAppContext', () => {
    afterAll(() => {
      vi.clearAllMocks();
    });

    conditionalTest({ max: 18 })('it does not return free_memory on older node versions', () => {
      const appContext = getAppContext();
      expect(appContext.free_memory).toBeUndefined();
    });

    conditionalTest({ min: 22 })(
      'returns free_memory if process.availableMemory is defined and returns a valid value',
      () => {
        const appContext = getAppContext();
        expect(appContext.free_memory).toEqual(expect.any(Number));
      },
    );

    conditionalTest({ min: 22 })('returns no free_memory if process.availableMemory ', () => {
      vi.spyOn(process as any, 'availableMemory').mockReturnValue(undefined as unknown as number);
      const appContext = getAppContext();
      expect(appContext.free_memory).toBeUndefined();
    });
  });

  describe('getDeviceContext', () => {
    afterAll(() => {
      vi.clearAllMocks();
    });

    it('returns boot time if os.uptime is defined and returns a valid uptime', () => {
      const deviceCtx = getDeviceContext({});
      expect(deviceCtx.boot_time).toEqual(expect.any(String));
    });

    it('returns no boot time if os.uptime() returns undefined', () => {
      vi.spyOn(os, 'uptime').mockReturnValue(undefined as unknown as number);
      const deviceCtx = getDeviceContext({});
      expect(deviceCtx.boot_time).toBeUndefined();
    });
  });

  describe('contextsToSpanAttributes', () => {
    it('maps app context', () => {
      const attrs = contextsToSpanAttributes({ app: { app_start_time: '2026-01-01T00:00:00.000Z', app_memory: 100 } });
      expect(attrs).toEqual({ 'app.start_time': '2026-01-01T00:00:00.000Z' });
    });

    it('maps device context', () => {
      const attrs = contextsToSpanAttributes({
        device: {
          arch: 'arm64',
          boot_time: '2026-01-01T00:00:00.000Z',
          memory_size: 1024,
          processor_count: 8,
          cpu_description: 'Apple M1',
          processor_frequency: 3200,
          free_memory: 512,
        },
      });
      expect(attrs).toEqual({
        'device.archs': ['arm64'],
        'device.boot_time': '2026-01-01T00:00:00.000Z',
        'device.memory_size': 1024,
        'device.processor_count': 8,
        'device.cpu_description': 'Apple M1',
        'device.processor_frequency': 3200,
      });
    });

    it('maps os context', () => {
      const attrs = contextsToSpanAttributes({ os: { name: 'macOS', version: '15.0', kernel_version: '24.0.0' } });
      expect(attrs).toEqual({ 'os.name': 'macOS', 'os.version': '15.0', 'os.kernel_version': '24.0.0' });
    });

    it('maps culture context', () => {
      const attrs = contextsToSpanAttributes({ culture: { locale: 'en-US', timezone: 'America/New_York' } });
      expect(attrs).toEqual({ 'culture.locale': 'en-US', 'culture.timezone': 'America/New_York' });
    });

    it('maps cloud resource context', () => {
      const attrs = contextsToSpanAttributes({
        cloud_resource: { 'cloud.provider': 'aws', 'cloud.region': 'us-east-1' },
      });
      expect(attrs).toEqual({ 'cloud.provider': 'aws', 'cloud.region': 'us-east-1' });
    });

    it('skips undefined values', () => {
      const attrs = contextsToSpanAttributes({ app: {}, device: {}, os: {} });
      expect(attrs).toEqual({});
    });
  });

  describe('getDynamicSpanAttributes', () => {
    it('includes app memory when app context is provided', () => {
      const attrs = getDynamicSpanAttributes(getAppContext(), undefined);
      expect(attrs['app.memory']).toEqual(expect.any(Number));
    });

    it('includes device free memory when device context has free_memory', () => {
      const attrs = getDynamicSpanAttributes(undefined, { free_memory: 1024 });
      expect(attrs['device.free_memory']).toEqual(expect.any(Number));
    });

    it('excludes device free memory when device context has no free_memory', () => {
      const attrs = getDynamicSpanAttributes(undefined, { arch: 'arm64' });
      expect(attrs['device.free_memory']).toBeUndefined();
    });

    it('returns empty when no contexts provided', () => {
      const attrs = getDynamicSpanAttributes(undefined, undefined);
      expect(attrs).toEqual({});
    });
  });

  describe('processSegmentSpan', () => {
    it('sets static and dynamic context attributes on segment span', () => {
      const integration = nodeContextIntegration();

      const span: StreamedSpanJSON = {
        trace_id: 'abc123',
        span_id: 'def456',
        name: 'test-span',
        start_timestamp: Date.now(),
        end_timestamp: Date.now(),
        status: 'ok',
        is_segment: true,
        attributes: {},
      };

      integration.processSegmentSpan!(span, {} as any);

      expect(span.attributes).toMatchObject({
        'app.start_time': expect.any(String),
        'device.memory_size': expect.any(Number),
        'device.processor_count': expect.any(Number),
        'device.cpu_description': expect.any(String),
        'device.processor_frequency': expect.any(Number),
        'process.runtime.engine.name': 'v8',
        'process.runtime.engine.version': process.versions.v8,
        'app.memory': expect.any(Number),
        'device.free_memory': expect.any(Number),
      });
    });

    it('does not overwrite existing attributes', () => {
      const integration = nodeContextIntegration();

      const span: StreamedSpanJSON = {
        trace_id: 'abc123',
        span_id: 'def456',
        name: 'test-span',
        start_timestamp: Date.now(),
        end_timestamp: Date.now(),
        status: 'ok',
        is_segment: true,
        attributes: {
          'process.runtime.engine.name': 'custom-engine',
        },
      };

      integration.processSegmentSpan!(span, {} as any);

      expect(span.attributes!['process.runtime.engine.name']).toBe('custom-engine');
    });

    it('respects disabled options', () => {
      const integration = nodeContextIntegration({
        app: false,
        device: false,
        os: false,
        culture: false,
        cloudResource: false,
      });

      const span: StreamedSpanJSON = {
        trace_id: 'abc123',
        span_id: 'def456',
        name: 'test-span',
        start_timestamp: Date.now(),
        end_timestamp: Date.now(),
        status: 'ok',
        is_segment: true,
        attributes: {},
      };

      integration.processSegmentSpan!(span, {} as any);

      expect(span.attributes).toEqual({
        'process.runtime.engine.name': 'v8',
        'process.runtime.engine.version': process.versions.v8,
      });
    });
  });
});
