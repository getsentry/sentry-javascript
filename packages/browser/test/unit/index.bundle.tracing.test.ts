import { Replay as ReplayShim } from '@sentry-internal/integration-shims';
import { BrowserTracing } from '@sentry-internal/tracing';

import * as TracingBundle from '../../src/index.bundle.tracing';

describe('index.bundle.tracing', () => {
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

    expect(TracingBundle.Integrations.BrowserTracing).toBe(BrowserTracing);
    expect(TracingBundle.BrowserTracing).toBe(BrowserTracing);
  });
});
