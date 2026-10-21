import * as nodeDiagnosticsChannel from 'node:diagnostics_channel';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type * as DiagnosticsChannelModule from '../../src/utils/diagnosticsChannel';

describe('diagnosticsChannel', () => {
  describe('outside of Bun', () => {
    it('exports the original functions', async () => {
      vi.resetModules();
      const diagnosticsChannel = await import('../../src/utils/diagnosticsChannel');

      expect(diagnosticsChannel.channel).toBe(nodeDiagnosticsChannel.channel);
      expect(diagnosticsChannel.subscribe).toBe(nodeDiagnosticsChannel.subscribe);
      expect(diagnosticsChannel.tracingChannel).toBe(nodeDiagnosticsChannel.tracingChannel);
    });
  });

  describe('on Bun', () => {
    let diagnosticsChannel: typeof DiagnosticsChannelModule;

    beforeAll(async () => {
      vi.stubGlobal('Bun', {});
      vi.resetModules();
      diagnosticsChannel = await import('../../src/utils/diagnosticsChannel');
    });

    afterAll(() => {
      vi.unstubAllGlobals();
    });

    it('wraps the original functions', () => {
      expect(diagnosticsChannel.channel).not.toBe(nodeDiagnosticsChannel.channel);
      expect(diagnosticsChannel.subscribe).not.toBe(nodeDiagnosticsChannel.subscribe);
      expect(diagnosticsChannel.tracingChannel).not.toBe(nodeDiagnosticsChannel.tracingChannel);
    });

    it('returns the same channel object for a name', () => {
      expect(diagnosticsChannel.channel('sentry-test:channel')).toBe(diagnosticsChannel.channel('sentry-test:channel'));
    });

    it('returns the same tracing channel object for a name', () => {
      expect(diagnosticsChannel.tracingChannel('sentry-test:tracing')).toBe(
        diagnosticsChannel.tracingChannel('sentry-test:tracing'),
      );
    });

    it('delivers messages to a handler subscribed by name', () => {
      const messages: unknown[] = [];
      diagnosticsChannel.subscribe('sentry-test:subscribe', message => messages.push(message));

      nodeDiagnosticsChannel.channel('sentry-test:subscribe').publish('hello');

      expect(messages).toEqual(['hello']);
    });

    it('delivers tracing events to subscribers of a tracing channel created by name', () => {
      const events: string[] = [];
      diagnosticsChannel.tracingChannel('sentry-test:tracing-events').subscribe({
        start: () => events.push('start'),
        end: () => events.push('end'),
        asyncStart: () => undefined,
        asyncEnd: () => undefined,
        error: () => undefined,
      });

      nodeDiagnosticsChannel.tracingChannel('sentry-test:tracing-events').traceSync(() => undefined, {});

      expect(events).toEqual(['start', 'end']);
    });

    it('creates a tracing channel from channel objects without caching it', () => {
      const channels = nodeDiagnosticsChannel.tracingChannel('sentry-test:objects');

      expect(diagnosticsChannel.tracingChannel(channels).start).toBe(channels.start);
    });
  });
});
