import { Feedback as FeedbackShim } from '@sentry-internal/integration-shims';
import { BrowserTracing } from '@sentry-internal/tracing';
import { Replay } from '@sentry/browser';

import * as TracingReplayBundle from '../../src/index.bundle.tracing.replay';

describe('index.bundle.tracing.replay', () => {
  it('has correct exports', () => {
    Object.keys(TracingReplayBundle.Integrations).forEach(key => {
      // Skip BrowserTracing because it doesn't have a static id field.
      if (key === 'BrowserTracing') {
        return;
      }

      expect((TracingReplayBundle.Integrations[key] as any).id).toStrictEqual(expect.any(String));
    });

    expect(TracingReplayBundle.Integrations.Replay).toBe(Replay);
    expect(TracingReplayBundle.Replay).toBe(Replay);

    expect(TracingReplayBundle.Integrations.BrowserTracing).toBe(BrowserTracing);
    expect(TracingReplayBundle.BrowserTracing).toBe(BrowserTracing);

    expect(TracingReplayBundle.Feedback).toBe(FeedbackShim);
  });
});
