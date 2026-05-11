import { beforeEach, describe, expect, it, vi } from 'vitest';
import { webVitalsIntegration } from '../../src/integrations/webVitals';

const mockRegisterInpInteractionListener = vi.hoisted(() => vi.fn());
const mockStartTrackingWebVitals = vi.hoisted(() => vi.fn());
const mockTrackClsAsSpan = vi.hoisted(() => vi.fn());
const mockTrackInpAsSpan = vi.hoisted(() => vi.fn());
const mockTrackLcpAsSpan = vi.hoisted(() => vi.fn());

vi.mock('@sentry-internal/browser-utils', () => ({
  registerInpInteractionListener: mockRegisterInpInteractionListener,
  startTrackingWebVitals: mockStartTrackingWebVitals,
  trackClsAsSpan: mockTrackClsAsSpan,
  trackInpAsSpan: mockTrackInpAsSpan,
  trackLcpAsSpan: mockTrackLcpAsSpan,
}));

describe('webVitalsIntegration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('tracks all web vitals by default', () => {
    const client = {};
    const integration = webVitalsIntegration();

    integration.setup?.(client as never);
    integration.afterAllSetup?.(client as never);

    expect(mockStartTrackingWebVitals).toHaveBeenCalledWith({
      disable: undefined,
    });
    expect(mockTrackLcpAsSpan).toHaveBeenCalledWith(client);
    expect(mockTrackClsAsSpan).toHaveBeenCalledWith(client);
    expect(mockTrackInpAsSpan).toHaveBeenCalledTimes(1);
    expect(mockRegisterInpInteractionListener).toHaveBeenCalledTimes(1);
  });

  it('disables selected web vitals', () => {
    const client = {};
    const integration = webVitalsIntegration({ disable: ['ttfb', 'fcp', 'lcp', 'inp'] });

    integration.setup?.(client as never);
    integration.afterAllSetup?.(client as never);

    expect(mockStartTrackingWebVitals).toHaveBeenCalledWith({
      disable: ['ttfb', 'fcp'],
    });
    expect(mockTrackLcpAsSpan).not.toHaveBeenCalled();
    expect(mockTrackClsAsSpan).toHaveBeenCalledWith(client);
    expect(mockTrackInpAsSpan).not.toHaveBeenCalled();
    expect(mockRegisterInpInteractionListener).not.toHaveBeenCalled();
  });
});
