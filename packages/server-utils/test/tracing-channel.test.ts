import { AsyncLocalStorage } from 'node:async_hooks';
import { tracingChannel } from 'node:diagnostics_channel';
import type { Scope, Span } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import {
  _INTERNAL_setSpanForScope,
  Client,
  createTransport,
  getActiveSpan,
  getCurrentScope,
  getDefaultCurrentScope,
  getDefaultIsolationScope,
  getGlobalScope,
  getIsolationScope,
  initAndBind,
  resolvedSyncPromise,
  setAsyncContextStrategy,
  spanToJSON,
  startInactiveSpan,
  startSpan,
} from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bindTracingChannelToSpan } from '../src/tracing-channel';

interface TestStore {
  scope: Scope;
  isolationScope: Scope;
}

class TestClient extends Client<any> {
  public eventFromException(): PromiseLike<any> {
    return resolvedSyncPromise({});
  }

  public eventFromMessage(): PromiseLike<any> {
    return resolvedSyncPromise({});
  }
}

function initTestClient(): void {
  initAndBind(TestClient, {
    dsn: 'https://username@domain/123',
    integrations: [],
    sendClientReports: false,
    stackParser: () => [],
    tracesSampleRate: 1,
    transport: () =>
      createTransport(
        {
          recordDroppedEvent: () => undefined,
        },
        () => resolvedSyncPromise({}),
      ),
  });
}

function installTestAsyncContextStrategy(): void {
  const asyncStorage = new AsyncLocalStorage<TestStore>();

  function getScopes(): TestStore {
    return (
      asyncStorage.getStore() || {
        scope: getDefaultCurrentScope(),
        isolationScope: getDefaultIsolationScope(),
      }
    );
  }

  setAsyncContextStrategy({
    withScope: callback => {
      const scope = getScopes().scope.clone();
      const isolationScope = getScopes().isolationScope;
      return asyncStorage.run({ scope, isolationScope }, () => callback(scope));
    },
    withSetScope: (scope, callback) => {
      const isolationScope = getScopes().isolationScope;
      return asyncStorage.run({ scope, isolationScope }, () => callback(scope));
    },
    withIsolationScope: callback => {
      const scope = getScopes().scope;
      const isolationScope = getScopes().isolationScope.clone();
      return asyncStorage.run({ scope, isolationScope }, () => callback(isolationScope));
    },
    withSetIsolationScope: (isolationScope, callback) => {
      const scope = getScopes().scope;
      return asyncStorage.run({ scope, isolationScope }, () => callback(isolationScope));
    },
    getCurrentScope: () => getScopes().scope,
    getIsolationScope: () => getScopes().isolationScope,
    getTracingChannelBinding: () => ({
      asyncLocalStorage: asyncStorage,
      getStoreWithActiveSpan: span => {
        const scope = getScopes().scope.clone();
        const isolationScope = getScopes().isolationScope;
        _INTERNAL_setSpanForScope(scope, span);
        return { scope, isolationScope };
      },
    }),
  });
}

describe('bindTracingChannelToSpan', () => {
  afterEach(() => {
    setAsyncContextStrategy(undefined);
    getCurrentScope().clear();
    getCurrentScope().setClient(undefined);
    getIsolationScope().clear();
    getGlobalScope().clear();
    vi.clearAllMocks();
  });

  it('calls the span callback on start and stores the span on data', () => {
    installTestAsyncContextStrategy();

    const span = startInactiveSpan({ name: 'channel-span' });
    const getSpan = vi.fn(() => span);
    const channel = bindTracingChannelToSpan(tracingChannel<{ operation: string }>('test:bind-span:data'), getSpan);

    let dataSpan: Span | undefined;
    channel.subscribe({
      end: data => {
        dataSpan = data._sentrySpan;
      },
    });

    channel.traceSync(() => undefined, { operation: 'read' });

    expect(getSpan).toHaveBeenCalledTimes(1);
    expect(getSpan).toHaveBeenCalledWith(expect.objectContaining({ operation: 'read', _sentrySpan: span }));
    expect(dataSpan).toBe(span);
  });

  it('sets the returned span as active inside the traced operation', () => {
    installTestAsyncContextStrategy();

    const span = startInactiveSpan({ name: 'channel-span' });
    const channel = bindTracingChannelToSpan(
      tracingChannel<{ operation: string }>('test:bind-span:active'),
      () => span,
    );

    let activeSpan: Span | undefined;

    channel.traceSync(
      () => {
        activeSpan = getActiveSpan();
      },
      { operation: 'read' },
    );

    expect(activeSpan).toBe(span);
  });

  it('parents child spans created inside the traced operation to the bound span', () => {
    installTestAsyncContextStrategy();
    initTestClient();

    const parent = startInactiveSpan({ forceTransaction: true, name: 'parent-span' });
    const channel = bindTracingChannelToSpan(
      tracingChannel<{ operation: string }>('test:bind-span:children'),
      () => parent,
    );

    let childParentSpanId: string | undefined;

    channel.traceSync(
      () => {
        startSpan({ name: 'child-span' }, child => {
          childParentSpanId = spanToJSON(child).parent_span_id;
        });
      },
      { operation: 'read' },
    );

    expect(childParentSpanId).toBe(parent.spanContext().spanId);
  });

  describe('auto lifecycle ending strategy', () => {
    const MECHANISM = { mechanism: { type: 'auto.diagnostic_channels.bind_span' } };

    // Returns a channel whose span we can observe, plus spies for `span.end` and `captureException`.
    function setup(name: string): {
      channel: ReturnType<typeof bindTracingChannelToSpan>;
      span: Span;
      endSpy: ReturnType<typeof vi.spyOn>;
      captureExceptionSpy: ReturnType<typeof vi.spyOn>;
    } {
      installTestAsyncContextStrategy();
      initTestClient();
      const span = startInactiveSpan({ name: 'channel-span' });
      const endSpy = vi.spyOn(span, 'end');
      const captureExceptionSpy = vi.spyOn(SentryCore, 'captureException').mockReturnValue('event-id');
      const channel = bindTracingChannelToSpan(tracingChannel<{ operation: string }>(name), () => span);
      return { channel, span, endSpy, captureExceptionSpy };
    }

    it('traceSync success: ends the span once on `end`', () => {
      const { channel, span, endSpy, captureExceptionSpy } = setup('test:lifecycle:sync-ok');

      channel.traceSync(() => undefined, { operation: 'read' });

      expect(endSpy).toHaveBeenCalledTimes(1);
      expect(spanToJSON(span).timestamp).toBeDefined();
      expect(spanToJSON(span).status).toBeUndefined();
      expect(captureExceptionSpy).not.toHaveBeenCalled();
    });

    it('traceSync throw: ends the span once on `end`, sets error status, captures the exception', () => {
      const { channel, span, endSpy, captureExceptionSpy } = setup('test:lifecycle:sync-throw');
      const error = new Error('sync-throw');

      expect(() =>
        channel.traceSync(
          () => {
            throw error;
          },
          { operation: 'read' },
        ),
      ).toThrow(error);

      expect(endSpy).toHaveBeenCalledTimes(1);
      expect(spanToJSON(span).status).toBe('Error: sync-throw');
      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith(error, MECHANISM);
    });

    it('traceSync throw of a falsy value: still ends the span once on `end`', () => {
      const { channel, endSpy, captureExceptionSpy } = setup('test:lifecycle:sync-throw-falsy');

      let threw = false;
      try {
        channel.traceSync(
          () => {
            throw 0;
          },
          { operation: 'read' },
        );
      } catch {
        threw = true;
      }

      // No async events follow a synchronous throw, so the span must be ended on `end` — even
      // though the thrown value is falsy, the `error` key is present on the context object.
      expect(threw).toBe(true);
      expect(endSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith(0, MECHANISM);
    });

    it('tracePromise resolve: ends the span once on `asyncEnd`, not on the early synchronous `end`', async () => {
      const { channel, span, endSpy, captureExceptionSpy } = setup('test:lifecycle:promise-ok');

      let resolveOperation: (value: string) => void;
      const promise = channel.tracePromise(
        () =>
          new Promise<string>(resolve => {
            resolveOperation = resolve;
          }),
        { operation: 'read' },
      );

      // The synchronous `end` event has already fired here, but the span must stay open until the promise settles.
      expect(endSpy).not.toHaveBeenCalled();

      resolveOperation!('ok');
      await promise;

      expect(endSpy).toHaveBeenCalledTimes(1);
      expect(spanToJSON(span).timestamp).toBeDefined();
      expect(spanToJSON(span).status).toBeUndefined();
      expect(captureExceptionSpy).not.toHaveBeenCalled();
    });

    it('tracePromise reject: ends the span once on `asyncEnd`, sets error status, captures the exception', async () => {
      const { channel, span, endSpy, captureExceptionSpy } = setup('test:lifecycle:promise-reject');
      const error = new Error('async-reject');

      let rejectOperation: (reason: Error) => void;
      const promise = channel.tracePromise(
        () =>
          new Promise<string>((_resolve, reject) => {
            rejectOperation = reject;
          }),
        { operation: 'read' },
      );

      expect(endSpy).not.toHaveBeenCalled();

      rejectOperation!(error);
      await expect(promise).rejects.toThrow(error);

      expect(endSpy).toHaveBeenCalledTimes(1);
      expect(spanToJSON(span).status).toBe('Error: async-reject');
      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith(error, MECHANISM);
    });

    it('tracePromise with a synchronous throw: ends the span once on `end` (no async events follow)', () => {
      const { channel, span, endSpy, captureExceptionSpy } = setup('test:lifecycle:promise-sync-throw');
      const error = new Error('promise-sync-throw');

      expect(() =>
        channel.tracePromise(
          () => {
            throw error;
          },
          { operation: 'read' },
        ),
      ).toThrow(error);

      expect(endSpy).toHaveBeenCalledTimes(1);
      expect(spanToJSON(span).status).toBe('Error: promise-sync-throw');
      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith(error, MECHANISM);
    });

    it('traceCallback success: ends the span once on `asyncEnd`', async () => {
      const { channel, span, endSpy, captureExceptionSpy } = setup('test:lifecycle:callback-ok');

      await new Promise<void>(done => {
        channel.traceCallback(
          (cb: (err: Error | null, result?: string) => void) => {
            setTimeout(() => cb(null, 'ok'), 1);
          },
          0,
          { operation: 'read' },
          undefined,
          () => done(),
        );
      });

      expect(endSpy).toHaveBeenCalledTimes(1);
      expect(spanToJSON(span).timestamp).toBeDefined();
      expect(spanToJSON(span).status).toBeUndefined();
      expect(captureExceptionSpy).not.toHaveBeenCalled();
    });

    it('traceCallback error: ends the span once on `asyncEnd`, sets error status, captures the exception', async () => {
      const { channel, span, endSpy, captureExceptionSpy } = setup('test:lifecycle:callback-error');
      const error = new Error('callback-error');

      await new Promise<void>(done => {
        channel.traceCallback(
          (cb: (err: Error | null, result?: string) => void) => {
            setTimeout(() => cb(error), 1);
          },
          0,
          { operation: 'read' },
          undefined,
          () => done(),
        );
      });

      expect(endSpy).toHaveBeenCalledTimes(1);
      expect(spanToJSON(span).status).toBe('Error: callback-error');
      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith(error, MECHANISM);
    });

    it('traceCallback with a synchronous throw: ends the span once on `end` (no async events follow)', () => {
      const { channel, span, endSpy, captureExceptionSpy } = setup('test:lifecycle:callback-sync-throw');
      const error = new Error('callback-sync-throw');

      expect(() =>
        channel.traceCallback(
          () => {
            throw error;
          },
          0,
          { operation: 'read' },
          undefined,
          () => undefined,
        ),
      ).toThrow(error);

      expect(endSpy).toHaveBeenCalledTimes(1);
      expect(spanToJSON(span).status).toBe('Error: callback-sync-throw');
      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith(error, MECHANISM);
    });
  });

  it('manual lifecycle: binds the span as active but does not end it automatically', () => {
    installTestAsyncContextStrategy();
    initTestClient();

    const span = startInactiveSpan({ name: 'channel-span' });
    const endSpy = vi.spyOn(span, 'end');
    const getSpan = vi.fn(() => span);
    const channel = bindTracingChannelToSpan(tracingChannel<{ operation: string }>('test:lifecycle:manual'), getSpan, {
      lifecycle: 'manual',
    });

    let activeSpan: Span | undefined;
    channel.traceSync(
      () => {
        activeSpan = getActiveSpan();
      },
      { operation: 'read' },
    );

    expect(getSpan).toHaveBeenCalledTimes(1);
    expect(activeSpan).toBe(span);
    expect(endSpy).not.toHaveBeenCalled();
    expect(spanToJSON(span).timestamp).toBeUndefined();
  });

  it('returns the channel unchanged when no async context binding is available', () => {
    // No async context strategy is installed, so the binding cannot be resolved.
    const span = startInactiveSpan({ name: 'channel-span' });
    const endSpy = vi.spyOn(span, 'end');
    const getSpan = vi.fn(() => span);
    const rawChannel = tracingChannel<{ operation: string }>('test:lifecycle:no-binding');

    const channel = bindTracingChannelToSpan(rawChannel, getSpan);

    expect(channel).toBe(rawChannel);

    channel.traceSync(() => undefined, { operation: 'read' });

    expect(getSpan).not.toHaveBeenCalled();
    expect(endSpy).not.toHaveBeenCalled();
  });
});
