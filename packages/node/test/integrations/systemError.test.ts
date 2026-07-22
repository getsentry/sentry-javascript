import type { Client, Event } from '@sentry/core';
import type * as nodeUtil from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { systemErrorIntegration } from '../../src/integrations/systemError';

const mocks = vi.hoisted(() => ({
  getSystemErrorMap: vi.fn() as ReturnType<typeof vi.fn> | undefined,
}));

vi.mock('node:util', async importOriginal => {
  const actual = (await importOriginal()) as typeof nodeUtil;
  mocks.getSystemErrorMap = vi.fn(actual.getSystemErrorMap);
  return {
    ...actual,
    get getSystemErrorMap() {
      return mocks.getSystemErrorMap;
    },
  };
});

import * as util from 'node:util';

describe('systemErrorIntegration', () => {
  afterEach(() => {
    vi.mocked(util.getSystemErrorMap).mockRestore();
  });

  function createClient({ sendDefaultPii, userInfo }: { sendDefaultPii?: boolean; userInfo?: boolean } = {}): Client {
    // When userInfo is explicitly provided, use it directly.
    // Otherwise fall back to sendDefaultPii (mimicking resolveDataCollectionOptions).
    const resolvedUserInfo = userInfo ?? sendDefaultPii ?? false;
    return {
      getOptions: () => ({ sendDefaultPii }),
      getDataCollectionOptions: () => ({ userInfo: resolvedUserInfo }),
    } as unknown as Client;
  }

  it('returns the event unchanged when util.getSystemErrorMap is undefined (e.g. Bun)', () => {
    const originalFn = mocks.getSystemErrorMap;
    mocks.getSystemErrorMap = undefined;

    try {
      const integration = systemErrorIntegration();
      const error = Object.assign(new Error('boom'), { errno: -2, path: '/some/path' });
      const event = { exception: { values: [{ value: error.message }] } } as Event;

      const result = integration.processEvent!(event, { originalException: error }, createClient()) as Event;

      expect(result).toBe(event);
      expect(result.contexts?.node_system_error).toBeUndefined();
    } finally {
      mocks.getSystemErrorMap = originalFn;
    }
  });

  it('adds node_system_error context for a real SystemError', () => {
    const errno = -2;
    vi.mocked(util.getSystemErrorMap).mockReturnValue(
      new Map<number, [string, string]>([[errno, ['ENOENT', 'no such file or directory']]]),
    );

    const integration = systemErrorIntegration();
    const error = Object.assign(new Error("ENOENT: no such file or directory, open '/secret/path'"), {
      errno,
      path: '/secret/path',
    });
    const event = { exception: { values: [{ value: error.message }] } } as Event;

    const result = integration.processEvent!(event, { originalException: error }, createClient()) as Event;

    expect(result.contexts?.node_system_error).toEqual({ errno });
    expect(result.exception?.values?.[0]?.value).not.toContain('/secret/path');
  });

  it('keeps path in context when userInfo is true', () => {
    const errno = -2;
    vi.mocked(util.getSystemErrorMap).mockReturnValue(
      new Map<number, [string, string]>([[errno, ['ENOENT', 'no such file or directory']]]),
    );

    const integration = systemErrorIntegration();
    const error = Object.assign(new Error('boom'), { errno, path: '/secret/path' });
    const event = { exception: { values: [{ value: error.message }] } } as Event;

    const result = integration.processEvent!(
      event,
      { originalException: error },
      createClient({ userInfo: true }),
    ) as Event;

    expect(result.contexts?.node_system_error).toEqual({ errno, path: '/secret/path' });
  });

  it('strips path from context when userInfo is false', () => {
    const errno = -2;
    vi.mocked(util.getSystemErrorMap).mockReturnValue(
      new Map<number, [string, string]>([[errno, ['ENOENT', 'no such file or directory']]]),
    );

    const integration = systemErrorIntegration();
    const error = Object.assign(new Error('boom'), { errno, path: '/secret/path' });
    const event = { exception: { values: [{ value: error.message }] } } as Event;

    const result = integration.processEvent!(event, { originalException: error }, createClient()) as Event;

    expect(result.contexts?.node_system_error).toEqual({ errno });
  });

  it('keeps path in context when legacy sendDefaultPii is true', () => {
    const errno = -2;
    vi.mocked(util.getSystemErrorMap).mockReturnValue(
      new Map<number, [string, string]>([[errno, ['ENOENT', 'no such file or directory']]]),
    );

    const integration = systemErrorIntegration();
    const error = Object.assign(new Error('boom'), { errno, path: '/secret/path' });
    const event = { exception: { values: [{ value: error.message }] } } as Event;

    const result = integration.processEvent!(
      event,
      { originalException: error },
      createClient({ sendDefaultPii: true }),
    ) as Event;

    expect(result.contexts?.node_system_error).toEqual({ errno, path: '/secret/path' });
  });

  it('strips path from context when legacy sendDefaultPii is false', () => {
    const errno = -2;
    vi.mocked(util.getSystemErrorMap).mockReturnValue(
      new Map<number, [string, string]>([[errno, ['ENOENT', 'no such file or directory']]]),
    );

    const integration = systemErrorIntegration();
    const error = Object.assign(new Error('boom'), { errno, path: '/secret/path' });
    const event = { exception: { values: [{ value: error.message }] } } as Event;

    const result = integration.processEvent!(
      event,
      { originalException: error },
      createClient({ sendDefaultPii: false }),
    ) as Event;

    expect(result.contexts?.node_system_error).toEqual({ errno });
  });

  it('keeps path in context when includePaths option is true', () => {
    const errno = -2;
    vi.mocked(util.getSystemErrorMap).mockReturnValue(
      new Map<number, [string, string]>([[errno, ['ENOENT', 'no such file or directory']]]),
    );

    const integration = systemErrorIntegration({ includePaths: true });
    const error = Object.assign(new Error('boom'), { errno, path: '/secret/path' });
    const event = { exception: { values: [{ value: error.message }] } } as Event;

    const result = integration.processEvent!(event, { originalException: error }, createClient()) as Event;

    expect(result.contexts?.node_system_error).toEqual({ errno, path: '/secret/path' });
  });

  it('returns the event unchanged when the error has no errno', () => {
    vi.mocked(util.getSystemErrorMap).mockReturnValue(
      new Map<number, [string, string]>([[-2, ['ENOENT', 'no such file or directory']]]),
    );

    const integration = systemErrorIntegration();
    const error = new Error('not a system error');
    const event = {} as Event;

    const result = integration.processEvent!(event, { originalException: error }, createClient()) as Event;

    expect(result?.contexts?.node_system_error).toBeUndefined();
  });

  it('returns the event unchanged when originalException is not an Error', () => {
    vi.mocked(util.getSystemErrorMap).mockReturnValue(
      new Map<number, [string, string]>([[-2, ['ENOENT', 'no such file or directory']]]),
    );

    const integration = systemErrorIntegration();
    const event = {} as Event;

    const result = integration.processEvent!(event, { originalException: 'not an error' }, createClient()) as Event;

    expect(result.contexts?.node_system_error).toBeUndefined();
  });

  it('returns the event unchanged when errno is not in the system error map', () => {
    vi.mocked(util.getSystemErrorMap).mockReturnValue(
      new Map<number, [string, string]>([[-2, ['ENOENT', 'no such file or directory']]]),
    );

    const integration = systemErrorIntegration();
    const error = Object.assign(new Error('unknown'), { errno: 99999 });
    const event = {} as Event;

    const result = integration.processEvent!(event, { originalException: error }, createClient()) as Event;

    expect(result.contexts?.node_system_error).toBeUndefined();
  });
});
