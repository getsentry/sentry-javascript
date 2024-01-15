import {
  BrowserTracing as BrowserTracingShim,
  Feedback as FeedbackShim,
  Replay as ReplayShim,
} from '@sentry-internal/integration-shims';

import * as TracingBundle from '../../src/index.bundle';

describe('index.bundle', () => {
  it('has correct exports', () => {
    Object.keys(TracingBundle.Integrations).forEach(key => {
      // Skip BrowserTracing because it doesn't have a static id field.
      if (key === 'BrowserTracing') {
        return;
      }

      expect((TracingBundle.Integrations[key] as any).id).toStrictEqual(expect.any(String));
    });

    expect(TracingBundle.Integrations.Replay).toBe(ReplayShim);
    expect(TracingBundle.Replay).toBe(ReplayShim);

    expect(TracingBundle.Integrations.BrowserTracing).toBe(BrowserTracingShim);
    expect(TracingBundle.BrowserTracing).toBe(BrowserTracingShim);

    expect(TracingBundle.Feedback).toBe(FeedbackShim);
  });
});
