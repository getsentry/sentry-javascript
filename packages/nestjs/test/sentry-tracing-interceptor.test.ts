import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { getDefaultIsolationScope, getIsolationScope } from '@sentry/core';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SentryModule } from '../src/setup';

const mocks = vi.hoisted(() => ({
  isolationScope: {
    setTransactionName: vi.fn(),
  },
  defaultIsolationScope: {},
  debugWarn: vi.fn(),
  inIsolationScope: false,
}));

vi.mock('@sentry/core', () => ({
  getDefaultIsolationScope: vi.fn(() => mocks.defaultIsolationScope),
  getIsolationScope: vi.fn(() => mocks.isolationScope),
  withIsolationScope: vi.fn((callback: (scope: unknown) => unknown) => {
    mocks.inIsolationScope = true;
    try {
      return callback(mocks.isolationScope);
    } finally {
      mocks.inIsolationScope = false;
    }
  }),
  debug: {
    warn: mocks.debugWarn,
  },
  captureException: vi.fn(),
}));

type Interceptor = {
  intercept: (context: ExecutionContext, next: CallHandler) => ReturnType<CallHandler['handle']>;
};

function createInterceptor(): Interceptor {
  const provider = SentryModule.forRoot().providers?.[0] as {
    useClass: new () => Interceptor;
  };

  return new provider.useClass();
}

function createContext(client: unknown, pattern: unknown): ExecutionContext {
  return {
    getType: vi.fn().mockReturnValue('ws'),
    switchToWs: vi.fn().mockReturnValue({
      getClient: vi.fn().mockReturnValue(client),
      getPattern: vi.fn().mockReturnValue(pattern),
    }),
  } as unknown as ExecutionContext;
}

describe('SentryTracingInterceptor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getIsolationScope).mockReturnValue(mocks.isolationScope as never);
    vi.mocked(getDefaultIsolationScope).mockReturnValue(mocks.defaultIsolationScope as never);
  });

  it('sets a transaction name for Socket.IO WebSocket contexts', () => {
    const interceptor = createInterceptor();
    const context = createContext({ nsp: { name: '/events' } }, 'message');
    const next = { handle: vi.fn(() => of(undefined)) } as unknown as CallHandler;

    interceptor.intercept(context, next).subscribe();

    expect(mocks.isolationScope.setTransactionName).toHaveBeenCalledWith('WS /events message');
  });

  it('sets a transaction name without a namespace for other WebSocket adapters', () => {
    const interceptor = createInterceptor();
    const context = createContext({}, 'message');
    const next = { handle: vi.fn(() => of(undefined)) } as unknown as CallHandler;

    interceptor.intercept(context, next).subscribe();

    expect(mocks.isolationScope.setTransactionName).toHaveBeenCalledWith('WS message');
  });

  it('passes through WebSocket contexts without a pattern', () => {
    const interceptor = createInterceptor();
    const context = createContext({ nsp: { name: '/events' } }, undefined);
    const next = { handle: vi.fn(() => of(undefined)) } as unknown as CallHandler;

    interceptor.intercept(context, next).subscribe();

    expect(mocks.isolationScope.setTransactionName).not.toHaveBeenCalled();
    expect(next.handle).toHaveBeenCalledTimes(1);
  });

  it('supports WebSocket hosts without getPattern', () => {
    const interceptor = createInterceptor();
    const context = {
      getType: vi.fn().mockReturnValue('ws'),
      switchToWs: vi.fn().mockReturnValue({
        getClient: vi.fn().mockReturnValue({ nsp: { name: '/events' } }),
      }),
    } as unknown as ExecutionContext;
    const next = { handle: vi.fn(() => of(undefined)) } as unknown as CallHandler;

    interceptor.intercept(context, next).subscribe();

    expect(mocks.isolationScope.setTransactionName).not.toHaveBeenCalled();
    expect(next.handle).toHaveBeenCalledTimes(1);
  });

  it('names WebSocket transactions when the current isolation scope is the default scope', () => {
    const interceptor = createInterceptor();
    const context = createContext({ nsp: { name: '/events' } }, 'message');
    const next = {
      handle: vi.fn(() => {
        expect(mocks.inIsolationScope).toBe(true);
        return of(undefined);
      }),
    } as unknown as CallHandler;
    vi.mocked(getIsolationScope).mockReturnValue(mocks.defaultIsolationScope as never);

    interceptor.intercept(context, next).subscribe();

    expect(mocks.isolationScope.setTransactionName).toHaveBeenCalledWith('WS /events message');
    expect(next.handle).toHaveBeenCalledTimes(1);
  });
});
