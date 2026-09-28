import type { ExecutionContext } from '@cloudflare/workers-types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { withSentry } from '../src/withSentry';
import { resetSdk } from './testUtils';

const MOCK_ENV = {
  SENTRY_DSN: 'https://public@dsn.ingest.sentry.io/1337',
};

function createMockExecutionContext(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
    props: {},
  } as unknown as ExecutionContext;
}

class WorkerEntrypoint {
  public constructor(
    public ctx: ExecutionContext,
    public env: unknown,
  ) {}
}

describe('withSentry', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetSdk();
  });

  it('returns the same handler object with its methods wrapped', () => {
    const fetch = vi.fn();
    const handler = { fetch };

    const wrapped = withSentry(() => ({}), handler);

    expect(wrapped).toBe(handler);
    expect(wrapped.fetch).not.toBe(fetch);
  });

  it('instruments a WorkerEntrypoint class instead of treating it as a handler object', () => {
    class MyEntrypoint extends WorkerEntrypoint {
      public ping(): string {
        return 'pong';
      }
    }

    const optionsCallback = vi.fn().mockReturnValue({ dsn: MOCK_ENV.SENTRY_DSN });
    const context = createMockExecutionContext();

    const Wrapped = withSentry(optionsCallback, MyEntrypoint as never) as unknown as typeof MyEntrypoint;
    const instance = new Wrapped(context, MOCK_ENV);

    expect(Wrapped).not.toBe(MyEntrypoint);
    expect(optionsCallback).toHaveBeenCalledWith(MOCK_ENV);
    expect(instance).toBeInstanceOf(MyEntrypoint);
    expect(instance.ctx).not.toBe(context);
    expect(instance.ping()).toBe('pong');
  });

  it('returns a handler it cannot instrument unchanged instead of throwing', () => {
    const fetch = vi.fn();
    const handler = Object.freeze({ fetch });

    let wrapped: typeof handler | undefined;
    expect(() => {
      wrapped = withSentry(() => ({}), handler);
    }).not.toThrow();

    expect(wrapped).toBe(handler);
    expect(wrapped?.fetch).toBe(fetch);
  });
});
