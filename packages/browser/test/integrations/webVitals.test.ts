import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { collectWebVitalsForClient, webVitalsIntegration } from '../../src/integrations/webVitals';

const mockRegisterInpInteractionListener = vi.hoisted(() => vi.fn());
const mockStartTrackingINP = vi.hoisted(() => vi.fn());
const mockStartTrackingWebVitals = vi.hoisted(() => vi.fn());
const mockTrackClsAsSpan = vi.hoisted(() => vi.fn());
const mockTrackInpAsSpan = vi.hoisted(() => vi.fn());
const mockTrackLcpAsSpan = vi.hoisted(() => vi.fn());

vi.mock('@sentry-internal/browser-utils', () => ({
  registerInpInteractionListener: mockRegisterInpInteractionListener,
  startTrackingINP: mockStartTrackingINP,
  startTrackingWebVitals: mockStartTrackingWebVitals,
  trackClsAsSpan: mockTrackClsAsSpan,
  trackInpAsSpan: mockTrackInpAsSpan,
  trackLcpAsSpan: mockTrackLcpAsSpan,
}));

describe('webVitalsIntegration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStartTrackingWebVitals.mockReturnValue(vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('tracks web vitals with the existing non-streaming behavior by default', () => {
    const client = { getOptions: () => ({}) };
    const integration = webVitalsIntegration();

    integration.setup?.(client as never);
    integration.afterAllSetup?.(client as never);

    expect(mockStartTrackingWebVitals).toHaveBeenCalledWith({
      recordClsStandaloneSpans: false,
      recordLcpStandaloneSpans: false,
      client,
    });
    expect(mockStartTrackingINP).toHaveBeenCalledTimes(1);
    expect(mockRegisterInpInteractionListener).toHaveBeenCalledTimes(1);
    expect(mockTrackLcpAsSpan).not.toHaveBeenCalled();
    expect(mockTrackClsAsSpan).not.toHaveBeenCalled();
    expect(mockTrackInpAsSpan).not.toHaveBeenCalled();
  });

  it('keeps standalone LCP and CLS experiments working', () => {
    const client = { getOptions: () => ({}) };
    const integration = webVitalsIntegration({
      _experiments: {
        enableStandaloneClsSpans: true,
        enableStandaloneLcpSpans: true,
      },
    });

    integration.setup?.(client as never);

    expect(mockStartTrackingWebVitals).toHaveBeenCalledWith({
      recordClsStandaloneSpans: true,
      recordLcpStandaloneSpans: true,
      client,
    });
  });

  it('tracks LCP, CLS and INP as streamed spans when span streaming is enabled', () => {
    const client = { getOptions: () => ({ traceLifecycle: 'stream' }) };
    const integration = webVitalsIntegration();

    integration.setup?.(client as never);
    integration.afterAllSetup?.(client as never);

    expect(mockStartTrackingWebVitals).toHaveBeenCalledWith({
      recordClsStandaloneSpans: undefined,
      recordLcpStandaloneSpans: undefined,
      client,
    });
    expect(mockTrackLcpAsSpan).toHaveBeenCalledWith(client);
    expect(mockTrackClsAsSpan).toHaveBeenCalledWith(client);
    expect(mockTrackInpAsSpan).toHaveBeenCalledTimes(1);
    expect(mockStartTrackingINP).not.toHaveBeenCalled();
    expect(mockRegisterInpInteractionListener).toHaveBeenCalledTimes(1);
  });

  it('supports ignoring selected web vitals for browserTracingIntegration compatibility', () => {
    const client = { getOptions: () => ({}) };
    const integration = webVitalsIntegration({ ignore: ['cls', 'inp', 'lcp'] });

    integration.setup?.(client as never);
    integration.afterAllSetup?.(client as never);

    expect(mockStartTrackingWebVitals).toHaveBeenCalledWith({
      recordClsStandaloneSpans: undefined,
      recordLcpStandaloneSpans: undefined,
      client,
    });
    expect(mockStartTrackingINP).not.toHaveBeenCalled();
    expect(mockTrackInpAsSpan).not.toHaveBeenCalled();
    expect(mockRegisterInpInteractionListener).not.toHaveBeenCalled();
  });

  it('exposes the web vital collection callback for browserTracingIntegration finalization', () => {
    const collectWebVitals = vi.fn();
    const client = { getOptions: () => ({}) };
    mockStartTrackingWebVitals.mockReturnValue(collectWebVitals);

    webVitalsIntegration().setup?.(client as never);
    collectWebVitalsForClient(client as never);

    expect(collectWebVitals).toHaveBeenCalledTimes(1);
  });
});
