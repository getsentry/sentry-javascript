import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { SENTRY_OP, SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import { WEBSOCKET } from '@sentry/conventions/op';
import { getDefaultIsolationScope, getIsolationScope, startSpanManual } from '@sentry/core';
import { of, tap } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SentryModule } from '../src/setup';

const mocks = vi.hoisted(() => ({
  isolationScope: {
    setTransactionName: vi.fn(),
  },
  defaultIsolationScope: {},
  debugWarn: vi.fn(),
  inIsolationScope: false,
  span: {
    end: vi.fn(),
  },
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
  withActiveSpan: vi.fn((_span: unknown, callback: () => unknown) => callback()),
  startSpanManual: vi.fn((_options: unknown, callback: (span: unknown) => unknown) => callback(mocks.span)),
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
    expect(startSpanManual).toHaveBeenCalledWith(
      {
        name: 'WS /events message',
        attributes: {
          [SENTRY_OP]: WEBSOCKET,
          [SENTRY_ORIGIN]: 'auto.middleware.nestjs.interceptor',
        },
      },
      expect.any(Function),
    );
    expect(mocks.span.end).toHaveBeenCalled();
  });

  it('ends the WebSocket span if the handler throws', () => {
    const interceptor = createInterceptor();
    const context = createContext({ nsp: { name: '/events' } }, 'message');
    const next = { handle: vi.fn(() => { throw new Error('handler failed'); }) } as unknown as CallHandler;

    expect(() => interceptor.intercept(context, next)).toThrow('handler failed');
    expect(mocks.span.end).toHaveBeenCalled();
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
        return of(undefined).pipe(
          tap(() => {
            expect(mocks.inIsolationScope).toBe(true);
          }),
        );
      }),
    } as unknown as CallHandler;
    vi.mocked(getIsolationScope).mockReturnValue(mocks.defaultIsolationScope as never);

    interceptor.intercept(context, next).subscribe();

    expect(mocks.isolationScope.setTransactionName).toHaveBeenCalledWith('WS /events message');
    expect(next.handle).toHaveBeenCalledTimes(1);
  });
});
