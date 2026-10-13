/**
 * @vitest-environment jsdom
 */

import type { Client } from '@sentry/core';
import * as sentryCore from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { diagnoseSdkConnectivity } from '../src/diagnose-sdk';

// Mock the @sentry/core module
vi.mock('@sentry/core', async requireActual => {
  return {
    ...((await requireActual()) as any),
    getClient: vi.fn(),
  };
});

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('diagnoseSdkConnectivity', () => {
  const mockGetClient = sentryCore.getClient as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns "no-client-active" when no client is active', async () => {
    mockGetClient.mockReturnValue(undefined);

    const result = await diagnoseSdkConnectivity();

    expect(result).toBe('no-client-active');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns "no-dsn-configured" when client.getDsn() returns undefined', async () => {
    const mockClient: Partial<Client> = {
      getDsn: vi.fn().mockReturnValue(undefined),
      getOptions: vi.fn().mockReturnValue({}),
    };
    mockGetClient.mockReturnValue(mockClient);

    const result = await diagnoseSdkConnectivity();

    expect(result).toBe('no-dsn-configured');
    expect(mockClient.getDsn).toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns "sentry-unreachable" when fetch throws an error', async () => {
    const mockClient: Partial<Client> = {
      getDsn: vi.fn().mockReturnValue('https://test@example.com/123'),
      getOptions: vi.fn().mockReturnValue({}),
    };
    mockGetClient.mockReturnValue(mockClient);
    mockFetch.mockRejectedValue(new Error('Network error'));

    const result = await diagnoseSdkConnectivity();

    expect(result).toBe('sentry-unreachable');
    expect(mockClient.getDsn).toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledWith(
      'https://o447951.ingest.sentry.io/api/4509632503087104/envelope/?sentry_version=7&sentry_key=c1dfb07d783ad5325c245c1fd3725390&sentry_client=sentry.javascript.browser%2F1.33.7',
      {
        body: '{}',
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
      },
    );
  });

  it('returns "sentry-unreachable" when fetch throws a TypeError (common for network issues)', async () => {
    const mockClient: Partial<Client> = {
      getDsn: vi.fn().mockReturnValue('https://test@example.com/123'),
      getOptions: vi.fn().mockReturnValue({}),
    };
    mockGetClient.mockReturnValue(mockClient);
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await diagnoseSdkConnectivity();

    expect(result).toBe('sentry-unreachable');
    expect(mockClient.getDsn).toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalled();
  });

  it('returns undefined when connectivity check succeeds', async () => {
    const mockClient: Partial<Client> = {
      getDsn: vi.fn().mockReturnValue('https://test@example.com/123'),
      getOptions: vi.fn().mockReturnValue({}),
    };
    mockGetClient.mockReturnValue(mockClient);
    mockFetch.mockResolvedValue(new Response('{}', { status: 200 }));

    const result = await diagnoseSdkConnectivity();

    expect(result).toBeUndefined();
    expect(mockClient.getDsn).toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledWith(
      'https://o447951.ingest.sentry.io/api/4509632503087104/envelope/?sentry_version=7&sentry_key=c1dfb07d783ad5325c245c1fd3725390&sentry_client=sentry.javascript.browser%2F1.33.7',
      {
        body: '{}',
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
      },
    );
  });

  it('returns undefined even when fetch returns an error status (4xx, 5xx)', async () => {
    const mockClient: Partial<Client> = {
      getDsn: vi.fn().mockReturnValue('https://test@example.com/123'),
      getOptions: vi.fn().mockReturnValue({}),
    };
    mockGetClient.mockReturnValue(mockClient);
    // Mock a 403 response (expected since the DSN is disabled)
    mockFetch.mockResolvedValue(new Response('Forbidden', { status: 403 }));

    const result = await diagnoseSdkConnectivity();

    // The function only cares about fetch not throwing, not the response status
    expect(result).toBeUndefined();
    expect(mockClient.getDsn).toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalled();
  });

  it('uses the correct test endpoint URL', async () => {
    const mockClient: Partial<Client> = {
      getDsn: vi.fn().mockReturnValue('https://test@example.com/123'),
      getOptions: vi.fn().mockReturnValue({}),
    };
    mockGetClient.mockReturnValue(mockClient);
    mockFetch.mockResolvedValue(new Response('{}', { status: 200 }));

    await diagnoseSdkConnectivity();

    expect(mockFetch).toHaveBeenCalledWith(
      'https://o447951.ingest.sentry.io/api/4509632503087104/envelope/?sentry_version=7&sentry_key=c1dfb07d783ad5325c245c1fd3725390&sentry_client=sentry.javascript.browser%2F1.33.7',
      expect.objectContaining({
        body: '{}',
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
      }),
    );
  });

  it('uses correct fetch options', async () => {
    const mockClient: Partial<Client> = {
      getDsn: vi.fn().mockReturnValue('https://test@example.com/123'),
      getOptions: vi.fn().mockReturnValue({}),
    };
    mockGetClient.mockReturnValue(mockClient);
    mockFetch.mockResolvedValue(new Response('{}', { status: 200 }));

    await diagnoseSdkConnectivity();

    expect(mockFetch).toHaveBeenCalledWith(expect.any(String), {
      body: '{}',
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
    });
  });

  it('calls suppressTracing to avoid tracing the fetch call to sentry', async () => {
    const suppressTracingSpy = vi.spyOn(sentryCore, 'suppressTracing');

    const mockClient: Partial<Client> = {
      getDsn: vi.fn().mockReturnValue('https://test@example.com/123'),
      getOptions: vi.fn().mockReturnValue({}),
    };
    mockGetClient.mockReturnValue(mockClient);
    mockFetch.mockResolvedValue(new Response('{}', { status: 200 }));

    await diagnoseSdkConnectivity();

    expect(suppressTracingSpy).toHaveBeenCalledTimes(1);
  });

  it('uses tunnel URL when tunnel option is configured', async () => {
    const tunnelUrl = '/monitor';
    const mockClient: Partial<Client> = {
      getDsn: vi.fn().mockReturnValue('https://test@example.com/123'),
      getOptions: vi.fn().mockReturnValue({ tunnel: tunnelUrl }),
    };
    mockGetClient.mockReturnValue(mockClient);
    mockFetch.mockResolvedValue(new Response('{}', { status: 200 }));

    const result = await diagnoseSdkConnectivity();

    expect(result).toBeUndefined();
    expect(mockFetch).toHaveBeenCalledWith(
      tunnelUrl,
      expect.objectContaining({
        body: '{}',
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
      }),
    );
  });

  it('uses default URL when tunnel is not configured', async () => {
    const mockClient: Partial<Client> = {
      getDsn: vi.fn().mockReturnValue('https://test@example.com/123'),
      getOptions: vi.fn().mockReturnValue({}),
    };
    mockGetClient.mockReturnValue(mockClient);
    mockFetch.mockResolvedValue(new Response('{}', { status: 200 }));

    const result = await diagnoseSdkConnectivity();

    expect(result).toBeUndefined();
    expect(mockFetch).toHaveBeenCalledWith(
      'https://o447951.ingest.sentry.io/api/4509632503087104/envelope/?sentry_version=7&sentry_key=c1dfb07d783ad5325c245c1fd3725390&sentry_client=sentry.javascript.browser%2F1.33.7',
      expect.objectContaining({
        body: '{}',
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
      }),
    );
  });

  it('returns "sentry-unreachable" when tunnel is configured but unreachable', async () => {
    const tunnelUrl = '/monitor';
    const mockClient: Partial<Client> = {
      getDsn: vi.fn().mockReturnValue('https://test@example.com/123'),
      getOptions: vi.fn().mockReturnValue({ tunnel: tunnelUrl }),
    };
    mockGetClient.mockReturnValue(mockClient);
    mockFetch.mockRejectedValue(new Error('Network error'));

    const result = await diagnoseSdkConnectivity();

    expect(result).toBe('sentry-unreachable');
    expect(mockFetch).toHaveBeenCalledWith(
      tunnelUrl,
      expect.objectContaining({
        body: '{}',
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
      }),
    );
  });
});
