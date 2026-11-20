import * as SentryNode from '@sentry/node';
import { SDK_VERSION } from '@sentry/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { init } from '../../../src/solid2/server';

const nodeInit = vi.spyOn(SentryNode, 'init').mockReturnValue(undefined);

describe('init (server)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets the SDK metadata', () => {
    init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });

    expect(nodeInit).toHaveBeenCalledTimes(1);
    expect(nodeInit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        _metadata: {
          sdk: {
            name: 'sentry.javascript.solid',
            packages: [
              { name: 'npm:@sentry/solid', version: SDK_VERSION },
              { name: 'npm:@sentry/node', version: SDK_VERSION },
            ],
            version: SDK_VERSION,
          },
        },
      }),
    );
  });

  it('adds solidServerErrorsIntegration to the default integrations', () => {
    init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });

    expect(nodeInit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        defaultIntegrations: expect.arrayContaining([expect.objectContaining({ name: 'SolidServerErrors' })]),
      }),
    );
  });
});
