import * as SentryCore from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startStandaloneWebVitalSpan } from '../../src/metrics/utils';

vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual('@sentry/core');
  return {
    ...actual,
    getClient: vi.fn(),
    getCurrentScope: vi.fn(),
    startInactiveSpan: vi.fn(),
  };
});

vi.mock('../../src/types', () => ({
  WINDOW: {
    navigator: { userAgent: 'test-user-agent' },
  },
}));

describe('startStandaloneWebVitalSpan', () => {
  const mockScope = {
    getUser: vi.fn().mockReturnValue(undefined),
    getScopeData: vi.fn().mockReturnValue({ contexts: {} }),
  };

  beforeEach(() => {
    vi.mocked(SentryCore.getCurrentScope).mockReturnValue(mockScope as any);
    vi.mocked(SentryCore.startInactiveSpan).mockReturnValue({ end: vi.fn() } as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('sets client.address to {{auto}} when dataCollection.userInfo is true', () => {
    const mockClient = {
      getOptions: vi.fn().mockReturnValue({ release: '1.0', environment: 'test' }),
      getDataCollectionOptions: vi.fn().mockReturnValue({ userInfo: true }),
      getIntegrationByName: vi.fn().mockReturnValue(undefined),
    };
    vi.mocked(SentryCore.getClient).mockReturnValue(mockClient as any);

    startStandaloneWebVitalSpan({
      name: 'test-vital',
      attributes: {},
      startTime: 1.0,
    });

    expect(SentryCore.startInactiveSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        attributes: expect.objectContaining({
          'client.address': '{{auto}}',
        }),
      }),
    );
  });

  it('does not set client.address when dataCollection.userInfo is false', () => {
    const mockClient = {
      getOptions: vi.fn().mockReturnValue({ release: '1.0', environment: 'test' }),
      getDataCollectionOptions: vi.fn().mockReturnValue({ userInfo: false }),
      getIntegrationByName: vi.fn().mockReturnValue(undefined),
    };
    vi.mocked(SentryCore.getClient).mockReturnValue(mockClient as any);

    startStandaloneWebVitalSpan({
      name: 'test-vital',
      attributes: {},
      startTime: 1.0,
    });

    expect(SentryCore.startInactiveSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        attributes: expect.not.objectContaining({
          'client.address': expect.anything(),
        }),
      }),
    );
  });
});
