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

  it('passes the configured form-data keys through to the channel instrumentation', () => {
    mockClient({ username: true }, ['incomingRequest']);

    remixIntegration().setupOnce?.();

    expect(instrumentRemix).toHaveBeenCalledWith({ keys: { username: true } });
  });

  it('passes the configured keys through even when `httpBodies` excludes `incomingRequest`', () => {
    // `captureActionFormDataKeys` is an integration-level option, so it wins over `dataCollection`.
    mockClient({ username: true }, []);

    remixIntegration().setupOnce?.();

    expect(instrumentRemix).toHaveBeenCalledWith({ keys: { username: true } });
  });

  it('captures all fields when only `httpBodies` opts in', () => {
    mockClient(undefined, ['incomingRequest']);

    remixIntegration().setupOnce?.();

    expect(instrumentRemix).toHaveBeenCalledWith({ keys: undefined });
  });

  it('captures nothing when neither option opts in', () => {
    mockClient(undefined, []);

    remixIntegration().setupOnce?.();

    expect(instrumentRemix).toHaveBeenCalledWith(undefined);
  });
});
