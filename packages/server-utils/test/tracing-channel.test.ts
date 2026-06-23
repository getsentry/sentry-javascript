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
import { bindTracingChannelToSpanWithLifeCycle, bindTracingChannelToSpan } from '../src/tracing-channel';

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

describe('bindTracingChannelToSpanWithLifeCycle', () => {
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
    const { channel } = bindTracingChannelToSpanWithLifeCycle(
      tracingChannel<{ operation: string }>('test:bind-span:data'),
      getSpan,
    );

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
    const { channel } = bindTracingChannelToSpanWithLifeCycle(
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
    const { channel } = bindTracingChannelToSpanWithLifeCycle(
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
    const MECHANISM = { mechanism: { type: 'auto.diagnostic_channels.bind_span', handled: false } };

    // Returns a channel whose span we can observe, plus spies for `span.end` and `captureException`.
    function setup(name: string): {
      channel: ReturnType<typeof bindTracingChannelToSpanWithLifeCycle>['channel'];
      span: Span;
      endSpy: ReturnType<typeof vi.spyOn>;
      captureExceptionSpy: ReturnType<typeof vi.spyOn>;
    } {
      installTestAsyncContextStrategy();
      initTestClient();
      const span = startInactiveSpan({ name: 'channel-span' });
      const endSpy = vi.spyOn(span, 'end');
      const captureExceptionSpy = vi.spyOn(SentryCore, 'captureException').mockReturnValue('event-id');
      const { channel } = bindTracingChannelToSpanWithLifeCycle(
        tracingChannel<{ operation: string }>(name),
        () => span,
      );
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
      expect(spanToJSON(span).status).toBe('sync-throw');
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
      expect(spanToJSON(span).status).toBe('async-reject');
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
      expect(spanToJSON(span).status).toBe('promise-sync-throw');
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
      expect(spanToJSON(span).status).toBe('callback-error');
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
      expect(spanToJSON(span).status).toBe('callback-sync-throw');
      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith(error, MECHANISM);
    });
  });

  describe('captureError', () => {
    it('does not capture the exception when `captureError` is false, but still sets error status', async () => {
      installTestAsyncContextStrategy();
      initTestClient();
      const captureExceptionSpy = vi.spyOn(SentryCore, 'captureException').mockReturnValue('event-id');

      const span = startInactiveSpan({ name: 'channel-span' });
      const error = new Error('db-down');
      const { channel } = bindTracingChannelToSpanWithLifeCycle(
        tracingChannel<{ operation: string }>('test:captureError:off'),
        () => span,
        { captureError: false },
      );

      await expect(
        channel.tracePromise(
          async () => {
            throw error;
          },
          { operation: 'read' },
        ),
      ).rejects.toThrow(error);

      expect(captureExceptionSpy).not.toHaveBeenCalled();
      expect(spanToJSON(span).status).toBe('db-down');
      expect(spanToJSON(span).timestamp).toBeDefined();
    });

    it('captures the exception with the default mechanism when `captureError` is true', async () => {
      installTestAsyncContextStrategy();
      initTestClient();
      const captureExceptionSpy = vi.spyOn(SentryCore, 'captureException').mockReturnValue('event-id');

      const span = startInactiveSpan({ name: 'channel-span' });
      const error = new Error('boom');
      const { channel } = bindTracingChannelToSpanWithLifeCycle(
        tracingChannel<{ operation: string }>('test:captureError:true'),
        () => span,
        { captureError: true },
      );

      await expect(
        channel.tracePromise(
          async () => {
            throw error;
          },
          { operation: 'read' },
        ),
      ).rejects.toThrow(error);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith(error, {
        mechanism: { type: 'auto.diagnostic_channels.bind_span', handled: false },
      });
      expect(spanToJSON(span).status).toBe('boom');
    });

    it('captures the exception with the hint returned by a `captureError` function, passing it the thrown error', async () => {
      installTestAsyncContextStrategy();
      initTestClient();
      const captureExceptionSpy = vi.spyOn(SentryCore, 'captureException').mockReturnValue('event-id');

      const span = startInactiveSpan({ name: 'channel-span' });
      const error = new Error('boom');
      const captureError = vi.fn(() => ({ mechanism: { type: 'auto.http.custom', handled: false } }));
      const { channel } = bindTracingChannelToSpanWithLifeCycle(
        tracingChannel<{ operation: string }>('test:captureError:fn'),
        () => span,
        { captureError },
      );

      await expect(
        channel.tracePromise(
          async () => {
            throw error;
          },
          { operation: 'read' },
        ),
      ).rejects.toThrow(error);

      expect(captureError).toHaveBeenCalledTimes(1);
      expect(captureError).toHaveBeenCalledWith(error);
      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith(error, {
        mechanism: { type: 'auto.http.custom', handled: false },
      });
      expect(spanToJSON(span).status).toBe('boom');
    });

    it('uses the default mechanism when `captureError` is a function on the synchronous error path', () => {
      installTestAsyncContextStrategy();
      initTestClient();
      const captureExceptionSpy = vi.spyOn(SentryCore, 'captureException').mockReturnValue('event-id');

      const span = startInactiveSpan({ name: 'channel-span' });
      const error = new Error('sync-boom');
      const captureError = vi.fn((e: unknown) => ({ extra: { caught: e instanceof Error } }));
      const { channel } = bindTracingChannelToSpanWithLifeCycle(
        tracingChannel<{ operation: string }>('test:captureError:fn-sync'),
        () => span,
        { captureError },
      );

      expect(() =>
        channel.traceSync(
          () => {
            throw error;
          },
          { operation: 'read' },
        ),
      ).toThrow(error);

      expect(captureError).toHaveBeenCalledWith(error);
      expect(captureExceptionSpy).toHaveBeenCalledWith(error, { extra: { caught: true } });
    });
  });

  describe('beforeSpanEnd', () => {
    it('runs with the span still open so enrichment lands, then the span is ended (sync)', () => {
      installTestAsyncContextStrategy();
      initTestClient();

      const span = startInactiveSpan({ name: 'channel-span' });
      let openWhenCalled: boolean | undefined;
      let receivedSpan: Span | undefined;
      const { channel } = bindTracingChannelToSpanWithLifeCycle(
        tracingChannel<{ operation: string }>('test:beforeSpanEnd:sync'),
        () => span,
        {
          beforeSpanEnd(s, data) {
            receivedSpan = s;
            openWhenCalled = spanToJSON(s).timestamp === undefined;
            expect(data._sentrySpan).toBe(s);
            expect('result' in data).toBe(true);
            s.setAttribute('enriched', true);
          },
        },
      );

      channel.traceSync(() => undefined, { operation: 'read' });

      expect(receivedSpan).toBe(span);
      expect(openWhenCalled).toBe(true);
      expect(spanToJSON(span).timestamp).toBeDefined();
      expect(spanToJSON(span).data.enriched).toBe(true);
    });

    it('runs before the span is ended on async completion', async () => {
      installTestAsyncContextStrategy();
      initTestClient();

      const span = startInactiveSpan({ name: 'channel-span' });
      const { channel } = bindTracingChannelToSpanWithLifeCycle(
        tracingChannel<{ operation: string }>('test:beforeSpanEnd:async'),
        () => span,
        {
          beforeSpanEnd(s) {
            expect(spanToJSON(s).timestamp).toBeUndefined();
            s.setAttribute('enriched', true);
          },
        },
      );

      await channel.tracePromise(async () => 'ok', { operation: 'read' });

      expect(spanToJSON(span).timestamp).toBeDefined();
      expect(spanToJSON(span).data.enriched).toBe(true);
    });

    it('runs on the error path with the error on the context object', async () => {
      installTestAsyncContextStrategy();
      initTestClient();
      vi.spyOn(SentryCore, 'captureException').mockReturnValue('event-id');

      const span = startInactiveSpan({ name: 'channel-span' });
      const error = new Error('boom');
      let sawError: unknown;
      const { channel } = bindTracingChannelToSpanWithLifeCycle(
        tracingChannel<{ operation: string }>('test:beforeSpanEnd:error'),
        () => span,
        {
          beforeSpanEnd(_s, data) {
            sawError = (data as { error?: unknown }).error;
          },
        },
      );

      await expect(
        channel.tracePromise(
          async () => {
            throw error;
          },
          { operation: 'read' },
        ),
      ).rejects.toThrow(error);

      expect(sawError).toBe(error);
      expect(spanToJSON(span).timestamp).toBeDefined();
    });
  });

  it('bindTracingChannelToSpan binds the span as active without ending it', () => {
    installTestAsyncContextStrategy();
    initTestClient();

    const span = startInactiveSpan({ name: 'channel-span' });
    const endSpy = vi.spyOn(span, 'end');
    const getSpan = vi.fn(() => span);
    const { channel } = bindTracingChannelToSpan(
      tracingChannel<{ operation: string }>('test:lifecycle:manual'),
      getSpan,
    );

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

    const { channel } = bindTracingChannelToSpanWithLifeCycle(rawChannel, getSpan);

    expect(channel).toBe(rawChannel);

    channel.traceSync(() => undefined, { operation: 'read' });

    expect(getSpan).not.toHaveBeenCalled();
    expect(endSpy).not.toHaveBeenCalled();
  });

  it('unbind detaches the binding: getSpan no longer runs and the span is no longer ended', () => {
    installTestAsyncContextStrategy();
    initTestClient();

    const span = startInactiveSpan({ name: 'channel-span' });
    const endSpy = vi.spyOn(span, 'end');
    const getSpan = vi.fn(() => span);
    const { channel, unbind } = bindTracingChannelToSpanWithLifeCycle(
      tracingChannel<{ operation: string }>('test:lifecycle:unbind'),
      getSpan,
    );

    // Sanity: while bound, the span is created and ended.
    channel.traceSync(() => undefined, { operation: 'read' });
    expect(getSpan).toHaveBeenCalledTimes(1);
    expect(endSpy).toHaveBeenCalledTimes(1);

    unbind();

    // After unbind, neither the start store nor the lifecycle handlers fire.
    channel.traceSync(() => undefined, { operation: 'read' });
    expect(getSpan).toHaveBeenCalledTimes(1);
    expect(endSpy).toHaveBeenCalledTimes(1);

    // Idempotent.
    expect(() => unbind()).not.toThrow();
  });

  describe('getSpan returns undefined', () => {
    it('skips binding and lifecycle, leaving the enclosing span as the active parent', () => {
      installTestAsyncContextStrategy();
      initTestClient();

      const getSpan = vi.fn(() => undefined);
      const { channel } = bindTracingChannelToSpanWithLifeCycle(
        tracingChannel<{ operation: string }>('test:skip:active'),
        getSpan,
      );

      let dataSpan: Span | undefined;
      channel.subscribe({
        end: data => {
          dataSpan = data._sentrySpan;
        },
      });

      let enclosingSpanId: string | undefined;
      let childParentSpanId: string | undefined;
      startSpan({ forceTransaction: true, name: 'enclosing-span' }, enclosing => {
        enclosingSpanId = enclosing.spanContext().spanId;
        channel.traceSync(
          () => {
            startSpan({ name: 'child-span' }, child => {
              childParentSpanId = spanToJSON(child).parent_span_id;
            });
          },
          { operation: 'read' },
        );
      });

      expect(getSpan).toHaveBeenCalledTimes(1);
      // No span was stamped onto the payload, so the lifecycle handlers have nothing to end.
      expect(dataSpan).toBeUndefined();
      // The context is left untouched, so children still parent to the enclosing span.
      expect(childParentSpanId).toBe(enclosingSpanId);
    });

    it('does not capture the exception on the error path when no span was bound', async () => {
      installTestAsyncContextStrategy();
      initTestClient();
      const captureExceptionSpy = vi.spyOn(SentryCore, 'captureException').mockReturnValue('event-id');

      const { channel } = bindTracingChannelToSpanWithLifeCycle(
        tracingChannel<{ operation: string }>('test:skip:error'),
        () => undefined,
      );

      const error = new Error('boom');
      await expect(
        channel.tracePromise(
          async () => {
            throw error;
          },
          { operation: 'read' },
        ),
      ).rejects.toThrow(error);

      expect(captureExceptionSpy).not.toHaveBeenCalled();
    });
  });
});
