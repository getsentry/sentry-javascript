import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { collectWebVitalsForClient, webVitalsIntegration } from '../../src/integrations/webVitals';

const mockRegisterInpInteractionListener = vi.hoisted(() => vi.fn());
const mockStartTrackingINP = vi.hoisted(() => vi.fn());
const mockStartTrackingWebVitals = vi.hoisted(() => vi.fn());

vi.mock('@sentry-internal/browser-utils', () => ({
  registerInpInteractionListener: mockRegisterInpInteractionListener,
  startTrackingINP: mockStartTrackingINP,
  startTrackingWebVitals: mockStartTrackingWebVitals,
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
      recordClsOnPageloadSpan: true,
      recordLcpOnPageloadSpan: true,
    });
    expect(mockStartTrackingINP).toHaveBeenCalledTimes(1);
    expect(mockRegisterInpInteractionListener).toHaveBeenCalledTimes(1);
  });

  it('tracks LCP and CLS as pageload measurements when span streaming is enabled', () => {
    const client = { getOptions: () => ({ traceLifecycle: 'stream' }) };
    const integration = webVitalsIntegration();

    integration.setup?.(client as never);
    integration.afterAllSetup?.(client as never);

    expect(mockStartTrackingWebVitals).toHaveBeenCalledWith({
      recordClsOnPageloadSpan: true,
      recordLcpOnPageloadSpan: true,
    });
    expect(mockStartTrackingINP).toHaveBeenCalledTimes(1);
    expect(mockRegisterInpInteractionListener).toHaveBeenCalledTimes(1);
  });

  it('supports disabling selected web vitals for browserTracingIntegration compatibility', () => {
    const client = { getOptions: () => ({}) };
    const integration = webVitalsIntegration({ disable: ['cls', 'inp', 'lcp'] });

    integration.setup?.(client as never);
    integration.afterAllSetup?.(client as never);

    expect(mockStartTrackingWebVitals).toHaveBeenCalledWith({
      recordClsOnPageloadSpan: false,
      recordLcpOnPageloadSpan: false,
    });
    expect(mockStartTrackingINP).not.toHaveBeenCalled();
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
