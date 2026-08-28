import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webVitalsIntegration } from '../../src/integrations/webVitals';

const mockAddWebVitalsToSpan = vi.hoisted(() => vi.fn());
const mockRegisterInpInteractionListener = vi.hoisted(() => vi.fn());
const mockStartTrackingWebVitals = vi.hoisted(() => vi.fn());
const mockTrackClsAsSpan = vi.hoisted(() => vi.fn());
const mockTrackInpAsSpan = vi.hoisted(() => vi.fn());
const mockTrackLcpAsSpan = vi.hoisted(() => vi.fn());
const mockEnableSoftNavigationReporting = vi.hoisted(() => vi.fn());
const mockEnableBfcacheReporting = vi.hoisted(() => vi.fn());
const mockStartSoftNavigationCorrelation = vi.hoisted(() => vi.fn());
const mockSupportsSoftNavigations = vi.hoisted(() => vi.fn());

vi.mock('@sentry/browser-utils', () => ({
  addWebVitalsToSpan: mockAddWebVitalsToSpan,
  enableBfcacheReporting: mockEnableBfcacheReporting,
  enableSoftNavigationReporting: mockEnableSoftNavigationReporting,
  registerInpInteractionListener: mockRegisterInpInteractionListener,
  startSoftNavigationCorrelation: mockStartSoftNavigationCorrelation,
  startTrackingWebVitals: mockStartTrackingWebVitals,
  supportsSoftNavigations: mockSupportsSoftNavigations,
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
    mockSupportsSoftNavigations.mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('tracks CLS/LCP as measurements and INP as a span by default', () => {
    const client = getMockClient();
    const integration = webVitalsIntegration();

    integration.setup?.(client as never);
    integration.afterAllSetup?.(client as never);

    expect(mockStartTrackingWebVitals).toHaveBeenCalledWith({
      trackCls: true,
      trackLcp: true,
      client,
    });
    expect(mockTrackInpAsSpan).toHaveBeenCalledTimes(1);
    expect(mockRegisterInpInteractionListener).toHaveBeenCalledTimes(1);
    expect(mockTrackLcpAsSpan).not.toHaveBeenCalled();
    expect(mockTrackClsAsSpan).not.toHaveBeenCalled();
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
    expect(mockTrackLcpAsSpan).toHaveBeenCalledWith(client, false);
    expect(mockTrackClsAsSpan).toHaveBeenCalledWith(client, false);
    expect(mockTrackInpAsSpan).toHaveBeenCalledTimes(1);
    expect(mockRegisterInpInteractionListener).toHaveBeenCalledTimes(1);
  });

  it('does not track ignored web vitals as streamed spans when span streaming is enabled', () => {
    const client = getMockClient({ traceLifecycle: 'stream' });
    const integration = webVitalsIntegration({ ignore: ['lcp'] });

    integration.setup?.(client as never);
    integration.afterAllSetup?.(client as never);

    expect(mockTrackLcpAsSpan).not.toHaveBeenCalled();
    expect(mockTrackClsAsSpan).toHaveBeenCalledWith(client, false);
    expect(mockTrackInpAsSpan).toHaveBeenCalledTimes(1);
  });

  it('reports soft navigation web vitals by default when supported', () => {
    mockSupportsSoftNavigations.mockReturnValue(true);
    const client = getMockClient({ traceLifecycle: 'stream' });
    const integration = webVitalsIntegration();

    integration.setup?.(client as never);

    expect(mockEnableSoftNavigationReporting).toHaveBeenCalledTimes(1);
    expect(mockStartSoftNavigationCorrelation).toHaveBeenCalledWith(client);
    expect(mockTrackLcpAsSpan).toHaveBeenCalledWith(client, true);
    expect(mockTrackClsAsSpan).toHaveBeenCalledWith(client, true);
    expect(mockTrackInpAsSpan).toHaveBeenCalledWith(client, true);
  });

  it('does not report soft navigation web vitals when opted out', () => {
    mockSupportsSoftNavigations.mockReturnValue(true);
    const client = getMockClient({ traceLifecycle: 'stream' });
    const integration = webVitalsIntegration({ softNavigations: false });

    integration.setup?.(client as never);

    expect(mockEnableSoftNavigationReporting).not.toHaveBeenCalled();
    expect(mockStartSoftNavigationCorrelation).not.toHaveBeenCalled();
    expect(mockTrackLcpAsSpan).toHaveBeenCalledWith(client, false);
    expect(mockTrackClsAsSpan).toHaveBeenCalledWith(client, false);
    expect(mockTrackInpAsSpan).toHaveBeenCalledWith(client, false);
  });

  it('does not report soft navigation web vitals without span streaming', () => {
    mockSupportsSoftNavigations.mockReturnValue(true);
    const client = getMockClient();
    const integration = webVitalsIntegration();

    integration.setup?.(client as never);

    expect(mockEnableSoftNavigationReporting).not.toHaveBeenCalled();
    expect(mockStartSoftNavigationCorrelation).not.toHaveBeenCalled();
    expect(mockTrackInpAsSpan).toHaveBeenCalledWith(client, false);
  });

  it('does not report bfcache web vitals by default', () => {
    const client = getMockClient({ traceLifecycle: 'stream' });
    const integration = webVitalsIntegration();

    integration.setup?.(client as never);

    expect(mockEnableBfcacheReporting).not.toHaveBeenCalled();
  });

  it('reports bfcache web vitals when opted in', () => {
    const client = getMockClient({ traceLifecycle: 'stream' });
    const integration = webVitalsIntegration({ bfcache: true });

    integration.setup?.(client as never);

    expect(mockEnableBfcacheReporting).toHaveBeenCalledTimes(1);
  });

  it('puts the trackers on the per-navigation path for bfcache alone', () => {
    // Soft navigations are unsupported here, so `bfcache` is the only thing that can select it.
    mockSupportsSoftNavigations.mockReturnValue(false);
    const client = getMockClient({ traceLifecycle: 'stream' });
    const integration = webVitalsIntegration({ bfcache: true });

    integration.setup?.(client as never);

    expect(mockTrackLcpAsSpan).toHaveBeenCalledWith(client, true);
    expect(mockTrackClsAsSpan).toHaveBeenCalledWith(client, true);
    expect(mockTrackInpAsSpan).toHaveBeenCalledWith(client, true);
  });

  it('does not report bfcache web vitals without span streaming', () => {
    const client = getMockClient();
    const integration = webVitalsIntegration({ bfcache: true });

    integration.setup?.(client as never);

    expect(mockEnableBfcacheReporting).not.toHaveBeenCalled();
    expect(mockTrackInpAsSpan).toHaveBeenCalledWith(client, false);
  });

  it('does not report soft navigation web vitals in unsupporting browsers', () => {
    const client = getMockClient({ traceLifecycle: 'stream' });
    const integration = webVitalsIntegration();

    integration.setup?.(client as never);

    expect(mockEnableSoftNavigationReporting).not.toHaveBeenCalled();
    expect(mockTrackLcpAsSpan).toHaveBeenCalledWith(client, false);
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
