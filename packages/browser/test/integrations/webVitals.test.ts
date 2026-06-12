import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webVitalsIntegration } from '../../src/integrations/webVitals';

const mockAddWebVitalsToSpan = vi.hoisted(() => vi.fn());
const mockRegisterInpInteractionListener = vi.hoisted(() => vi.fn());
const mockStartTrackingINP = vi.hoisted(() => vi.fn());
const mockStartTrackingWebVitals = vi.hoisted(() => vi.fn());
const mockTrackClsAsSpan = vi.hoisted(() => vi.fn());
const mockTrackInpAsSpan = vi.hoisted(() => vi.fn());
const mockTrackLcpAsSpan = vi.hoisted(() => vi.fn());

vi.mock('@sentry/browser-utils', () => ({
  addWebVitalsToSpan: mockAddWebVitalsToSpan,
  registerInpInteractionListener: mockRegisterInpInteractionListener,
  startTrackingINP: mockStartTrackingINP,
  startTrackingWebVitals: mockStartTrackingWebVitals,
  trackClsAsSpan: mockTrackClsAsSpan,
  trackInpAsSpan: mockTrackInpAsSpan,
  trackLcpAsSpan: mockTrackLcpAsSpan,
}));

function getMockClient(options: Record<string, unknown> = {}) {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();

  return {
    getOptions: () => options,
    on: vi.fn((hook: string, callback: (...args: unknown[]) => void) => {
      const callbacks = listeners.get(hook) ?? [];
      callbacks.push(callback);
      listeners.set(hook, callbacks);

      return () => {
        const updatedCallbacks = listeners.get(hook)?.filter(cb => cb !== callback) ?? [];
        listeners.set(hook, updatedCallbacks);
      };
    }),
    emit: (hook: string, ...args: unknown[]) => {
      listeners.get(hook)?.forEach(callback => {
        callback(...args);
      });
    },
  };
}

describe('webVitalsIntegration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStartTrackingWebVitals.mockReturnValue(vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('tracks web vitals as measurements by default', () => {
    const client = getMockClient();
    const integration = webVitalsIntegration();

    integration.setup?.(client as never);
    integration.afterAllSetup?.(client as never);

    expect(mockStartTrackingWebVitals).toHaveBeenCalledWith({
      trackCls: true,
      trackLcp: true,
      client,
    });
    expect(mockStartTrackingINP).toHaveBeenCalledTimes(1);
    expect(mockRegisterInpInteractionListener).toHaveBeenCalledTimes(1);
    expect(mockTrackLcpAsSpan).not.toHaveBeenCalled();
    expect(mockTrackClsAsSpan).not.toHaveBeenCalled();
    expect(mockTrackInpAsSpan).not.toHaveBeenCalled();
  });

  it('tracks LCP, CLS and INP as streamed spans when span streaming is enabled', () => {
    const client = getMockClient({ traceLifecycle: 'stream' });
    const integration = webVitalsIntegration();

    integration.setup?.(client as never);
    integration.afterAllSetup?.(client as never);

    // CLS/LCP are tracked as standalone spans, not as measurements on the pageload span
    expect(mockStartTrackingWebVitals).toHaveBeenCalledWith({
      trackCls: false,
      trackLcp: false,
      client,
    });
    expect(mockTrackLcpAsSpan).toHaveBeenCalledWith(client);
    expect(mockTrackClsAsSpan).toHaveBeenCalledWith(client);
    expect(mockTrackInpAsSpan).toHaveBeenCalledTimes(1);
    expect(mockStartTrackingINP).not.toHaveBeenCalled();
    expect(mockRegisterInpInteractionListener).toHaveBeenCalledTimes(1);
  });

  it('does not track ignored web vitals as streamed spans when span streaming is enabled', () => {
    const client = getMockClient({ traceLifecycle: 'stream' });
    const integration = webVitalsIntegration({ ignore: ['lcp'] });

    integration.setup?.(client as never);
    integration.afterAllSetup?.(client as never);

    expect(mockTrackLcpAsSpan).not.toHaveBeenCalled();
    expect(mockTrackClsAsSpan).toHaveBeenCalledWith(client);
    expect(mockTrackInpAsSpan).toHaveBeenCalledTimes(1);
  });

  it('supports ignoring selected web vitals', () => {
    const client = getMockClient();
    const integration = webVitalsIntegration({ ignore: ['cls', 'inp', 'lcp'] });

    integration.setup?.(client as never);
    integration.afterAllSetup?.(client as never);

    expect(mockStartTrackingWebVitals).toHaveBeenCalledWith({
      trackCls: false,
      trackLcp: false,
      client,
    });
    expect(mockStartTrackingINP).not.toHaveBeenCalled();
    expect(mockTrackInpAsSpan).not.toHaveBeenCalled();
    expect(mockRegisterInpInteractionListener).not.toHaveBeenCalled();
  });

  it('finalizes web vitals and writes them onto the pageload span when it ends', () => {
    const finalizeWebVitals = vi.fn();
    const client = getMockClient();
    const span = {};
    mockStartTrackingWebVitals.mockReturnValue(finalizeWebVitals);

    webVitalsIntegration().setup?.(client as never);
    client.emit('afterStartPageLoadSpan', span);
    client.emit('spanEnd', span);

    expect(finalizeWebVitals).toHaveBeenCalledTimes(1);
    expect(mockAddWebVitalsToSpan).toHaveBeenCalledWith(span, {
      recordClsOnPageloadSpan: true,
      recordLcpOnPageloadSpan: true,
      spanStreamingEnabled: false,
    });
  });

  it('does not write web vitals onto non-pageload spans', () => {
    const finalizeWebVitals = vi.fn();
    const client = getMockClient();
    mockStartTrackingWebVitals.mockReturnValue(finalizeWebVitals);

    webVitalsIntegration().setup?.(client as never);
    client.emit('spanEnd', {});

    expect(finalizeWebVitals).not.toHaveBeenCalled();
    expect(mockAddWebVitalsToSpan).not.toHaveBeenCalled();
  });

  it('does not record CLS/LCP on the pageload span when span streaming is enabled', () => {
    const client = getMockClient({ traceLifecycle: 'stream' });
    const span = {};

    webVitalsIntegration().setup?.(client as never);
    client.emit('afterStartPageLoadSpan', span);
    client.emit('spanEnd', span);

    expect(mockAddWebVitalsToSpan).toHaveBeenCalledWith(span, {
      recordClsOnPageloadSpan: false,
      recordLcpOnPageloadSpan: false,
      spanStreamingEnabled: true,
    });
  });
});
