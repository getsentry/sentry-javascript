import * as os from 'node:os';
import type { StreamedSpanJSON } from '@sentry/core';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { getAppContext, getDeviceContext, nodeContextIntegration } from '../../src/integrations/context';
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

  describe('processSegmentSpan', () => {
    it('sets context attributes on segment span', () => {
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
        'device.archs': [os.arch()],
        'device.processor_count': expect.any(Number),
        'process.runtime.engine.name': 'v8',
        'process.runtime.engine.version': process.versions.v8,
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
      const integration = nodeContextIntegration({ app: false, device: false, os: false });

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
        'process.runtime.engine.name': 'v8',
        'process.runtime.engine.version': process.versions.v8,
      });
      expect(span.attributes!['app.start_time']).toBeUndefined();
      expect(span.attributes!['device.archs']).toBeUndefined();
      expect(span.attributes!['device.processor_count']).toBeUndefined();
    });
  });
});
