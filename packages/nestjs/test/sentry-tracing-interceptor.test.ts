import 'reflect-metadata';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { SENTRY_OP, SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import { WEBSOCKET } from '@sentry/conventions/op';
import {
  getDefaultIsolationScope,
  getIsolationScope,
  SPAN_STATUS_ERROR,
  startNewTrace,
  startSpanManual,
  withIsolationScope,
} from '@sentry/core';
import type * as SentryCore from '@sentry/core';
import { asyncScheduler, config, observeOn, of, tap, throwError } from 'rxjs';
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
    setStatus: vi.fn(),
    end: vi.fn(),
  },
}));

vi.mock('@sentry/core', async importOriginal => ({
  ...(await importOriginal<typeof SentryCore>()),
  getDefaultIsolationScope: vi.fn(() => mocks.defaultIsolationScope),
  getIsolationScope: vi.fn(() => mocks.isolationScope),
  withIsolationScope: vi.fn((...args: unknown[]) => {
    const callback = args[args.length - 1] as (scope: unknown) => unknown;
    mocks.inIsolationScope = true;
    try {
      return callback(mocks.isolationScope);
    } finally {
      mocks.inIsolationScope = false;
    }
  }),
  startNewTrace: vi.fn((callback: () => unknown) => callback()),
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

function createContext(client: unknown, pattern: unknown, gatewayClass: unknown = class {}): ExecutionContext {
  return {
    getType: vi.fn().mockReturnValue('ws'),
    getClass: vi.fn().mockReturnValue(gatewayClass),
    getHandler: vi.fn().mockReturnValue(() => undefined),
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
    expect(startNewTrace).toHaveBeenCalledTimes(1);
    expect(withIsolationScope).toHaveBeenLastCalledWith(mocks.isolationScope, expect.any(Function));
    expect(startSpanManual).toHaveBeenCalledWith(
      {
        name: 'WS /events message',
        attributes: {
          [SENTRY_OP]: WEBSOCKET,
          [SENTRY_ORIGIN]: 'auto.websocket.nestjs.interceptor',
        },
      },
      expect.any(Function),
    );
    expect(mocks.span.end).toHaveBeenCalled();
  });

  it('ends the WebSocket span if the handler throws', () => {
    const interceptor = createInterceptor();
    const context = createContext({ nsp: { name: '/events' } }, 'message');
    const next = {
      handle: vi.fn(() => {
        throw new Error('handler failed');
      }),
    } as unknown as CallHandler;

    expect(() => interceptor.intercept(context, next)).toThrow('handler failed');
    expect(mocks.span.setStatus).toHaveBeenCalledWith({
      code: SPAN_STATUS_ERROR,
      message: 'internal_error',
    });
    expect(mocks.span.end).toHaveBeenCalled();
  });

  it('marks the WebSocket span as failed when the handler Observable errors asynchronously', async () => {
    const interceptor = createInterceptor();
    const context = createContext({ nsp: { name: '/events' } }, 'message');
    const handlerError = new Error('handler failed');
    const errorHandler = vi.fn();
    const next = {
      handle: vi.fn(() => throwError(() => handlerError).pipe(observeOn(asyncScheduler))),
    } as unknown as CallHandler;

    const observable = interceptor.intercept(context, next);
    await new Promise<void>(resolve => {
      observable.subscribe({
        error: error => {
          errorHandler(error);
          resolve();
        },
      });
    });

    expect(errorHandler).toHaveBeenCalledWith(handlerError);
    expect(mocks.span.setStatus).toHaveBeenCalledWith({
      code: SPAN_STATUS_ERROR,
      message: 'internal_error',
    });
    expect(mocks.span.end).toHaveBeenCalled();
  });

  it('marks the WebSocket span as failed with the positional subscribe error callback', () => {
    const interceptor = createInterceptor();
    const context = createContext({ nsp: { name: '/events' } }, 'message');
    const handlerError = new Error('handler failed');
    const errorHandler = vi.fn();
    const next = { handle: vi.fn(() => throwError(() => handlerError)) } as unknown as CallHandler;

    interceptor.intercept(context, next).subscribe(undefined, errorHandler);

    expect(errorHandler).toHaveBeenCalledWith(handlerError);
    expect(mocks.span.setStatus).toHaveBeenCalledWith({
      code: SPAN_STATUS_ERROR,
      message: 'internal_error',
    });
    expect(mocks.span.end).toHaveBeenCalled();
  });

  it('marks the WebSocket span as failed for observer objects without an error handler', async () => {
    const interceptor = createInterceptor();
    const context = createContext({ nsp: { name: '/events' } }, 'message');
    const handlerError = new Error('handler failed');
    const errorHandler = vi.fn();
    const next = { handle: vi.fn(() => throwError(() => handlerError)) } as unknown as CallHandler;

    const unhandledError = new Promise(resolve => {
      config.onUnhandledError = resolve;
    });
    try {
      // RxJS's typings reject this call shape, but callers can still pass it at runtime. RxJS ignores the positional
      // callback when it gets an observer object.
      (interceptor.intercept(context, next) as unknown as { subscribe: (...args: unknown[]) => unknown }).subscribe(
        { next: vi.fn() },
        errorHandler,
      );
      await expect(unhandledError).resolves.toBe(handlerError);
    } finally {
      config.onUnhandledError = null;
    }

    expect(errorHandler).not.toHaveBeenCalled();
    expect(mocks.span.setStatus).toHaveBeenCalledWith({
      code: SPAN_STATUS_ERROR,
      message: 'internal_error',
    });
    expect(mocks.span.end).toHaveBeenCalled();
  });

  it('does not mark the WebSocket span as failed for expected WsExceptions', () => {
    const interceptor = createInterceptor();
    const context = createContext({ nsp: { name: '/events' } }, 'message');
    const wsException = Object.assign(new Error('Unauthorized'), {
      getError: () => 'Unauthorized',
      initMessage: () => undefined,
    });
    const errorHandler = vi.fn();
    const next = { handle: vi.fn(() => throwError(() => wsException)) } as unknown as CallHandler;

    interceptor.intercept(context, next).subscribe({ error: errorHandler });

    expect(errorHandler).toHaveBeenCalledWith(wsException);
    expect(mocks.span.setStatus).not.toHaveBeenCalled();
    expect(mocks.span.end).toHaveBeenCalled();
  });

  it.each([
    ['a regex', /^\/tenant-\d+$/],
    ['a function', (_name: string, _auth: unknown, next: (err: null, ok: boolean) => void) => next(null, true)],
  ])('omits the namespace for gateways with %s namespace', (_, namespace) => {
    class DynamicGateway {}
    Reflect.defineMetadata('websockets:gateway_options', { namespace }, DynamicGateway);
    const interceptor = createInterceptor();
    const context = createContext({ nsp: { name: '/tenant-42' } }, 'message', DynamicGateway);
    const next = { handle: vi.fn(() => of(undefined)) } as unknown as CallHandler;

    interceptor.intercept(context, next).subscribe();

    expect(mocks.isolationScope.setTransactionName).toHaveBeenCalledWith('WS message');
  });

  it('keeps the namespace for gateways with a string namespace', () => {
    class StaticGateway {}
    Reflect.defineMetadata('websockets:gateway_options', { namespace: 'events' }, StaticGateway);
    const interceptor = createInterceptor();
    const context = createContext({ nsp: { name: '/events' } }, 'message', StaticGateway);
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

  function createContextWithoutGetPattern(handler: () => void): ExecutionContext {
    return {
      getType: vi.fn().mockReturnValue('ws'),
      getClass: vi.fn().mockReturnValue(class {}),
      getHandler: vi.fn().mockReturnValue(handler),
      switchToWs: vi.fn().mockReturnValue({
        getClient: vi.fn().mockReturnValue({ nsp: { name: '/events' } }),
      }),
    } as unknown as ExecutionContext;
  }

  it('falls back to the @SubscribeMessage pattern on Nest versions without getPattern', () => {
    const handler = (): void => undefined;
    Reflect.defineMetadata('message', 'message', handler);
    const interceptor = createInterceptor();
    const next = { handle: vi.fn(() => of(undefined)) } as unknown as CallHandler;

    interceptor.intercept(createContextWithoutGetPattern(handler), next).subscribe();

    expect(mocks.isolationScope.setTransactionName).toHaveBeenCalledWith('WS /events message');
  });

  it('passes through when neither getPattern nor a @SubscribeMessage pattern is available', () => {
    const interceptor = createInterceptor();
    const next = { handle: vi.fn(() => of(undefined)) } as unknown as CallHandler;

    interceptor
      .intercept(
        createContextWithoutGetPattern(() => undefined),
        next,
      )
      .subscribe();

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
