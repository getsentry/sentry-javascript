import { getClient, startInactiveSpan } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SentrySpanExporter } from '../src/spanExporter';
import { cleanupOtel, mockSdkInit } from './helpers/mockSdkInit';

const exportSpy = vi.spyOn(SentrySpanExporter.prototype, 'export');

describe('SentrySpanProcessor', () => {
  beforeEach(() => {
    exportSpy.mockClear();
  });

  describe('with traceLifecycle: static (default)', () => {
    beforeEach(() => {
      mockSdkInit({ tracesSampleRate: 1 });
    });

    afterEach(async () => {
      await cleanupOtel();
    });

    it('exports spans via the exporter', () => {
      const span = startInactiveSpan({ name: 'test' });
      span.end();

      expect(exportSpy).toHaveBeenCalled();
    });
  });

  describe('with traceLifecycle: stream', () => {
    beforeEach(() => {
      mockSdkInit({ tracesSampleRate: 1, traceLifecycle: 'stream' });
    });

    afterEach(async () => {
      await cleanupOtel();
    });

    it('does not export spans via the exporter', () => {
      const span = startInactiveSpan({ name: 'test' });
      span.end();

      expect(exportSpy).not.toHaveBeenCalled();
    });

    it('emits afterSpanEnd', () => {
      const afterSpanEndCallback = vi.fn();
      const client = getClient()!;
      client.on('afterSpanEnd', afterSpanEndCallback);

      const span = startInactiveSpan({ name: 'test' });
      span.end();

      expect(afterSpanEndCallback).toHaveBeenCalledWith(span);
    });
  });
});
