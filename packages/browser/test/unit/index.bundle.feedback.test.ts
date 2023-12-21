import { BrowserTracing as BrowserTracingShim, Replay as ReplayShim } from '@sentry-internal/integration-shims';
import { Feedback } from '@sentry/browser';

import * as TracingReplayBundle from '../../src/index.bundle.feedback';

describe('index.bundle.feedback', () => {
  it('has correct exports', () => {
    Object.keys(TracingReplayBundle.Integrations).forEach(key => {
      // Skip BrowserTracing because it doesn't have a static id field.
      if (key === 'BrowserTracing') {
        return;
      }

      expect((TracingReplayBundle.Integrations[key] as any).id).toStrictEqual(expect.any(String));
    });

    expect(TracingReplayBundle.Integrations.Replay).toBe(ReplayShim);
    expect(TracingReplayBundle.Replay).toBe(ReplayShim);

    expect(TracingReplayBundle.Integrations.BrowserTracing).toBe(BrowserTracingShim);
    expect(TracingReplayBundle.BrowserTracing).toBe(BrowserTracingShim);

    expect(TracingReplayBundle.Feedback).toBe(Feedback);
  });
});
