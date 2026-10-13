import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { close, getClient, getCurrentScope, getDefaultIntegrations, init, spanStreamingIntegration } from '../src';
import { type Event, type Integration, originalConsoleMethods } from '@sentry/core';

afterEach(() => {
  getCurrentScope().setClient(undefined);
});

describe('getDefaultIntegrations', () => {
  it('includes request data collection by default', () => {
    expect(getDefaultIntegrations().map(integration => integration.name)).toContain('RequestData');
  });

  it('collects and filters request cookies by default', () => {
    const client = init({ enableOpenTelemetrySetup: false });
    const requestDataIntegration = getDefaultIntegrations().find(integration => integration.name === 'RequestData');
    const event: Event = {
      sdkProcessingMetadata: {
        normalizedRequest: { headers: { cookie: 'theme=dark; session=secret' } },
      },
    };

    requestDataIntegration?.processEvent?.(event, {}, client);

    expect(requestDataIntegration).toBeDefined();
    expect(event.request?.cookies).toEqual({ theme: 'dark', session: '[Filtered]' });
    expect(event.request?.headers?.cookie).toBe('[Filtered]');
  });

  it('does not collect request cookies when dataCollection.cookies is disabled', () => {
    const client = init({ dataCollection: { cookies: false }, enableOpenTelemetrySetup: false });
    const requestDataIntegration = getDefaultIntegrations().find(integration => integration.name === 'RequestData');
    const event: Event = {
      sdkProcessingMetadata: {
        normalizedRequest: { headers: { cookie: 'theme=dark' } },
      },
    };

    requestDataIntegration?.processEvent?.(event, {}, client);

    expect(requestDataIntegration).toBeDefined();
    expect(event.request?.cookies).toBeUndefined();
    expect(event.request?.headers).toEqual({});
  });
});

describe('init', () => {
  it('adds spanStreamingIntegration by default', () => {
    const client = init({});
    const integrations = client?.getOptions().integrations;

    expect(integrations?.map(i => i.name)).toContain('SpanStreaming');
  });

  it('doesn\'t add spanStreamingIntegration when traceLifecycle is "static"', () => {
    const client = init({ traceLifecycle: 'static' });
    const integrations = client?.getOptions().integrations;

    expect(integrations?.map(i => i.name)).not.toContain('SpanStreaming');
  });

  it('adds spanStreaming integration even with custom defaultIntegrations', () => {
    const client = init({ defaultIntegrations: [] });
    const integrations = client?.getOptions().integrations;

    expect(integrations?.map(i => i.name)).toContain('SpanStreaming');
  });

  type MarkedIntegration = Integration & { _custom?: boolean };

  it("doesn't add spanStreamingIntegration if user added it manually", () => {
    const customSpanStreamingIntegration: MarkedIntegration = spanStreamingIntegration();
    customSpanStreamingIntegration._custom = true;

    const client = init({ traceLifecycle: 'stream', integrations: [customSpanStreamingIntegration] });
    const integrations = client?.getOptions().integrations.filter(i => i.name === 'SpanStreaming');

    expect(integrations?.length).toBe(1);
    expect((integrations?.[0] as MarkedIntegration)?._custom).toBe(true);
  });

  describe('when called again', () => {
    // `consoleSandbox` calls the method stored in `originalConsoleMethods`, so a
    // spy on `console.warn` misses the warning once the console is instrumented.
    const originalWarn = originalConsoleMethods.warn;
    let warnSpy: Mock;

    beforeEach(() => {
      warnSpy = vi.fn();
      originalConsoleMethods.warn = warnSpy;
    });

    afterEach(() => {
      if (originalWarn) {
        originalConsoleMethods.warn = originalWarn;
      } else {
        delete originalConsoleMethods.warn;
      }
    });

    it('warns and replaces the active client', () => {
      const first = init({ enableOpenTelemetrySetup: false });
      const second = init({ enableOpenTelemetrySetup: false });

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('`Sentry.init()` was called more than once'));
      expect(second).not.toBe(first);
      expect(getClient()).toBe(second);
    });

    it('does not warn after close()', async () => {
      init({ enableOpenTelemetrySetup: false });
      await close();
      const second = init({ enableOpenTelemetrySetup: false });

      expect(warnSpy).not.toHaveBeenCalled();
      expect(getClient()).toBe(second);
    });
  });
});
