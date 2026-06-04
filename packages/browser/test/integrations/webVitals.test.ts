import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webVitalsIntegration } from '../../src/integrations/webVitals';

const mockAddWebVitalsToSpan = vi.hoisted(() => vi.fn());
const mockRegisterInpInteractionListener = vi.hoisted(() => vi.fn());
const mockStartTrackingINP = vi.hoisted(() => vi.fn());
const mockStartTrackingWebVitals = vi.hoisted(() => vi.fn());
const mockTrackInpAsSpan = vi.hoisted(() => vi.fn());

vi.mock('@sentry/browser-utils', () => ({
  addWebVitalsToSpan: mockAddWebVitalsToSpan,
  registerInpInteractionListener: mockRegisterInpInteractionListener,
  startTrackingINP: mockStartTrackingINP,
  startTrackingWebVitals: mockStartTrackingWebVitals,
  trackInpAsSpan: mockTrackInpAsSpan,
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
    expect(mockTrackInpAsSpan).not.toHaveBeenCalled();
  });

  it('tracks INP as a streamed span when span streaming is enabled', () => {
    const client = getMockClient({ traceLifecycle: 'stream' });
    const integration = webVitalsIntegration();

    integration.setup?.(client as never);
    integration.afterAllSetup?.(client as never);

    expect(mockStartTrackingWebVitals).toHaveBeenCalledWith({
      trackCls: true,
      trackLcp: true,
      client,
    });
    expect(mockTrackInpAsSpan).toHaveBeenCalledTimes(1);
    expect(mockStartTrackingINP).not.toHaveBeenCalled();
    expect(mockRegisterInpInteractionListener).toHaveBeenCalledTimes(1);
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

  it('records CLS/LCP on the pageload span even when span streaming is enabled', () => {
    const client = getMockClient({ traceLifecycle: 'stream' });
    const span = {};

    webVitalsIntegration().setup?.(client as never);
    client.emit('afterStartPageLoadSpan', span);
    client.emit('spanEnd', span);

    expect(mockAddWebVitalsToSpan).toHaveBeenCalledWith(span, {
      recordClsOnPageloadSpan: true,
      recordLcpOnPageloadSpan: true,
      spanStreamingEnabled: true,
    });
  });
});
