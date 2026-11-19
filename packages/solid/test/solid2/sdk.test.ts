import { SDK_VERSION } from '@sentry/browser';
import * as SentryBrowser from '@sentry/browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { init } from '../../src/solid2';

const browserInit = vi.spyOn(SentryBrowser, 'init');

describe('init', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets the SDK metadata', () => {
    init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });

    expect(browserInit).toHaveBeenCalledTimes(1);
    expect(browserInit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        _metadata: {
          sdk: {
            name: 'sentry.javascript.solid',
            packages: [{ name: 'npm:@sentry/solid', version: SDK_VERSION }],
            version: SDK_VERSION,
            settings: { infer_ip: 'auto' },
          },
        },
      }),
    );
  });

  it('adds solidErrorsIntegration to the default integrations', () => {
    init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });

    expect(browserInit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        defaultIntegrations: expect.arrayContaining([expect.objectContaining({ name: 'SolidErrors' })]),
      }),
    );
  });
});
