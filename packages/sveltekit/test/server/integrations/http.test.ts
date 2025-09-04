import * as SentryNode from '@sentry/node';
import { describe, expect, it, vi } from 'vitest';
import { httpIntegration as svelteKitHttpIntegration } from '../../../src/server/integrations/http';

describe('httpIntegration', () => {
  it('calls the original httpIntegration with incoming request span recording disabled', () => {
    const sentryNodeHttpIntegration = vi.spyOn(SentryNode, 'httpIntegration');
    svelteKitHttpIntegration({ breadcrumbs: false });

    expect(sentryNodeHttpIntegration).toHaveBeenCalledTimes(1);
    expect(sentryNodeHttpIntegration).toHaveBeenCalledWith({
      breadcrumbs: false, // leaves other options untouched
      disableIncomingRequestSpans: true,
    });
  });

  it('allows users to override incoming request span recording', () => {
    const sentryNodeHttpIntegration = vi.spyOn(SentryNode, 'httpIntegration');
    svelteKitHttpIntegration({ breadcrumbs: false, disableIncomingRequestSpans: false });

    expect(sentryNodeHttpIntegration).toHaveBeenCalledTimes(1);
    expect(sentryNodeHttpIntegration).toHaveBeenCalledWith({
      breadcrumbs: false,
      disableIncomingRequestSpans: false,
    });
  });
});
