import * as SentryCore from '@sentry/core';
import type { NodeClient } from '@sentry/node';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/server/integrations/tracing-channel', () => ({
  instrumentRemix: vi.fn(),
}));

import { remixIntegration } from '../../src/server/integrations/RemixIntegration';
import { instrumentRemix } from '../../src/server/integrations/tracing-channel';

function mockClient(
  captureActionFormDataKeys: Record<string, string | boolean> | undefined,
  httpBodies: string[],
): void {
  vi.spyOn(SentryCore, 'getClient').mockReturnValue({
    getOptions: () => ({ captureActionFormDataKeys }),
    getDataCollectionOptions: () => ({ httpBodies }),
  } as unknown as NodeClient);
}

describe('remixIntegration', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('passes the opted-in form-data keys through to the channel instrumentation', () => {
    mockClient({ username: true }, ['incomingRequest']);

    remixIntegration().setupOnce?.();

    expect(instrumentRemix).toHaveBeenCalledWith({ username: true });
  });

  it('passes undefined attributes when form-data capture is not opted into', () => {
    // `httpBodies` without `incomingRequest` means capture is off, regardless of the configured keys.
    mockClient({ username: true }, []);

    remixIntegration().setupOnce?.();

    expect(instrumentRemix).toHaveBeenCalledWith(undefined);
  });
});
