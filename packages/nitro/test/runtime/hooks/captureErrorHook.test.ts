import * as SentryCore from '@sentry/core';
import * as SentryServerUtils from '@sentry/server-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { captureErrorHook } from '../../../src/runtime/hooks/captureErrorHook';

vi.mock('@sentry/core', async importOriginal => ({ ...(await importOriginal()), getClient: vi.fn() }));
vi.mock('@sentry/server-utils', async importOriginal => ({
  ...(await importOriginal()),
  captureNitroRequestError: vi.fn(),
}));

describe('captureErrorHook', () => {
  const error = new Error('Test error');
  const errorContext = { event: { req: { method: 'GET', url: 'http://localhost/test-path' } } };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('captures the error', async () => {
    vi.mocked(SentryCore.getClient).mockReturnValue({ getOptions: () => ({}) } as SentryCore.Client);

    await captureErrorHook(error, errorContext as never);

    expect(SentryServerUtils.captureNitroRequestError).toHaveBeenCalledWith(error, errorContext);
  });

  it('does not capture when enableNitroErrorHandler is false', async () => {
    vi.mocked(SentryCore.getClient).mockReturnValue({
      getOptions: () => ({ enableNitroErrorHandler: false }),
    } as unknown as SentryCore.Client);

    await captureErrorHook(error, errorContext as never);

    expect(SentryServerUtils.captureNitroRequestError).not.toHaveBeenCalled();
  });
});
