import { AsyncLocalStorage } from 'node:async_hooks';
import { tracingChannel } from 'node:diagnostics_channel';
import type { Scope, Span } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import {
  _INTERNAL_setSpanForScope,
  getDefaultCurrentScope,
  getDefaultIsolationScope,
  setAsyncContextStrategy,
} from '@sentry/core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { amqplibChannelIntegration } from '../../src/orchestrion';
import { CHANNELS } from '../../src/orchestrion/channels';

interface TestStore {
  scope: Scope;
  isolationScope: Scope;
}

// `bindTracingChannelToSpan` only binds (and `setupOnce` only subscribes via
// `waitForTracingChannelBinding`) when an async-context strategy exposes a
// `getTracingChannelBinding`. Install a minimal one so the channel
// subscriptions actually register in this unit-test context (no SDK `init`).
function installTestAsyncContextStrategy(): void {
  const asyncStorage = new AsyncLocalStorage<TestStore>();

  function getScopes(): TestStore {
    return asyncStorage.getStore() || { scope: getDefaultCurrentScope(), isolationScope: getDefaultIsolationScope() };
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

function makeSpan(): Span {
  return { end: vi.fn(), setStatus: vi.fn(), setAttributes: vi.fn() } as unknown as Span;
}

// A channel instance whose `serverProperties.product` yields `messaging.system: 'rabbitmq'`.
function makeChannel(): { connection: { serverProperties: { product: string } } } {
  return { connection: { serverProperties: { product: 'RabbitMQ' } } };
}

describe('amqplibChannelIntegration', () => {
  let startInactiveSpanSpy: MockInstance;
  let span: Span;

  beforeAll(() => {
    installTestAsyncContextStrategy();
    amqplibChannelIntegration().setupOnce?.();
  });

  afterAll(() => {
    setAsyncContextStrategy(undefined);
  });

  beforeEach(() => {
    span = makeSpan();
    startInactiveSpanSpy = vi.spyOn(SentryCore, 'startInactiveSpan').mockReturnValue(span);
    // Continue the callback synchronously so the consumer span is built inline.
    vi.spyOn(SentryCore, 'continueTrace').mockImplementation(((_options: unknown, cb: () => unknown) =>
      cb()) as unknown as typeof SentryCore.continueTrace);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('publish: builds a PRODUCER span with messaging attributes and the orchestrion origin', () => {
    const ctx = {
      arguments: ['my-exchange', 'my-routing-key', Buffer.from('hi'), { messageId: 'm1', correlationId: 'c1' }],
      self: makeChannel(),
    };

    tracingChannel(CHANNELS.AMQPLIB_PUBLISH).traceSync(() => true, ctx);

    expect(startInactiveSpanSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'publish my-exchange',
        op: 'message',
        attributes: expect.objectContaining({
          'messaging.system': 'rabbitmq',
          'messaging.destination': 'my-exchange',
          'messaging.rabbitmq.routing_key': 'my-routing-key',
          'messaging.message_id': 'm1',
          'messaging.conversation_id': 'c1',
          'sentry.origin': 'auto.amqplib.orchestrion.publisher',
        }),
      }),
    );
    // Ends synchronously once the publish call returns.
    expect(span.end).toHaveBeenCalledTimes(1);
  });

  it('publish: injects the trace headers into the publish options', () => {
    vi.spyOn(SentryCore, 'getTraceData').mockReturnValue({ 'sentry-trace': 'trace-abc', baggage: 'baggage-abc' });
    const options: { headers?: Record<string, unknown> } = {};
    const ctx = { arguments: ['ex', 'rk', Buffer.from('hi'), options], self: makeChannel() };

    tracingChannel(CHANNELS.AMQPLIB_PUBLISH).traceSync(() => true, ctx);

    expect(options.headers).toEqual({ 'sentry-trace': 'trace-abc', baggage: 'baggage-abc' });
  });

  it('publish: creates the options object when the caller omitted it', () => {
    vi.spyOn(SentryCore, 'getTraceData').mockReturnValue({ 'sentry-trace': 'trace-xyz' });
    const ctx: { arguments: unknown[]; self: unknown } = {
      arguments: ['ex', 'rk', Buffer.from('hi')],
      self: makeChannel(),
    };

    tracingChannel(CHANNELS.AMQPLIB_PUBLISH).traceSync(() => true, ctx);

    expect(ctx.arguments[3]).toEqual({ headers: { 'sentry-trace': 'trace-xyz' } });
  });

  it('consume + ack: builds a CONSUMER span that stays open until the message is acked', async () => {
    const channel = makeChannel();

    // Register the consumer so the dispatch hook knows the queue + ack mode. amqplib resolves
    // `consume` (registering the consumerTag) before any message can be dispatched.
    await tracingChannel(CHANNELS.AMQPLIB_CONSUME).tracePromise(async () => ({ consumerTag: 'ct-1' }), {
      arguments: ['queue1', () => {}, { noAck: false }],
      self: channel,
    });

    const message = { fields: { exchange: '', routingKey: 'queue1' }, properties: { headers: {} } };
    tracingChannel(CHANNELS.AMQPLIB_DISPATCH).traceSync(() => undefined, {
      arguments: [{ consumerTag: 'ct-1' }, message],
      self: channel,
    });

    expect(startInactiveSpanSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'queue1 process',
        op: 'message',
        attributes: expect.objectContaining({
          'messaging.system': 'rabbitmq',
          'messaging.operation': 'process',
          'sentry.origin': 'auto.amqplib.orchestrion.consumer',
        }),
      }),
    );
    // Manual ack: the span must stay open after the dispatch returns.
    expect(span.end).not.toHaveBeenCalled();

    tracingChannel(CHANNELS.AMQPLIB_ACK).traceSync(() => undefined, { arguments: [message], self: channel });

    expect(span.end).toHaveBeenCalledTimes(1);
  });

  it('consume (noAck): ends the CONSUMER span when dispatch returns', async () => {
    const channel = makeChannel();

    await tracingChannel(CHANNELS.AMQPLIB_CONSUME).tracePromise(async () => ({ consumerTag: 'ct-2' }), {
      arguments: ['queue-noack', () => {}, { noAck: true }],
      self: channel,
    });

    const message = { fields: { exchange: '', routingKey: 'queue-noack' }, properties: { headers: {} } };
    tracingChannel(CHANNELS.AMQPLIB_DISPATCH).traceSync(() => undefined, {
      arguments: [{ consumerTag: 'ct-2' }, message],
      self: channel,
    });

    expect(span.end).toHaveBeenCalledTimes(1);
  });

  it('reject: sets an error status on the consumer span', async () => {
    const channel = makeChannel();

    await tracingChannel(CHANNELS.AMQPLIB_CONSUME).tracePromise(async () => ({ consumerTag: 'ct-3' }), {
      arguments: ['queue-reject', () => {}, { noAck: false }],
      self: channel,
    });

    const message = { fields: { exchange: '', routingKey: 'queue-reject' }, properties: { headers: {} } };
    tracingChannel(CHANNELS.AMQPLIB_DISPATCH).traceSync(() => undefined, {
      arguments: [{ consumerTag: 'ct-3' }, message],
      self: channel,
    });

    tracingChannel(CHANNELS.AMQPLIB_REJECT).traceSync(() => undefined, {
      arguments: [message, false],
      self: channel,
    });

    expect(span.setStatus).toHaveBeenCalledWith(expect.objectContaining({ code: expect.anything() }));
    expect(span.end).toHaveBeenCalledTimes(1);
  });

  it('dispatch: does not create a span for a consumer-cancel notification (null message)', () => {
    const channel = makeChannel();
    tracingChannel(CHANNELS.AMQPLIB_DISPATCH).traceSync(() => undefined, {
      arguments: [{ consumerTag: 'ct-x' }, null],
      self: channel,
    });

    expect(startInactiveSpanSpy).not.toHaveBeenCalled();
  });

  // A confirm channel's `publish` internally calls the base `Channel.prototype.publish`, which fires
  // its own tracing channel. The subscriber must produce a single producer span, not two.
  describe('confirm channel guard', () => {
    // Drives a `ConfirmChannel.publish` the way orchestrion does — as a callback channel whose body
    // synchronously runs the base `publish` channel (mirroring `super.publish`) and whose trailing
    // callback fires when the broker confirms.
    function publishOnConfirmChannel(
      channel: unknown,
      { onBrokerConfirm }: { onBrokerConfirm: (cb: (err?: unknown) => void) => void },
    ): void {
      tracingChannel(CHANNELS.AMQPLIB_CONFIRM_PUBLISH).traceCallback(
        function (_options: unknown, cb: (err?: unknown) => void) {
          tracingChannel(CHANNELS.AMQPLIB_PUBLISH).traceSync(() => true, {
            arguments: ['orders', 'confirm-key', Buffer.from('payload'), {}],
            self: channel,
          });
          onBrokerConfirm(cb);
        },
        1,
        { arguments: ['orders', 'confirm-key', Buffer.from('payload'), {}], self: channel },
        undefined,
        {},
        () => {},
      );
    }

    it('creates exactly one producer span despite the internal base publish', async () => {
      const channel = makeChannel();

      await new Promise<void>(resolve => {
        publishOnConfirmChannel(channel, {
          onBrokerConfirm: cb =>
            setImmediate(() => {
              cb(null);
              resolve();
            }),
        });
      });

      expect(startInactiveSpanSpy).toHaveBeenCalledTimes(1);
      expect(span.end).toHaveBeenCalledTimes(1);
    });

    it('clears the guard so later publishes on the same channel are still instrumented', async () => {
      const channel = makeChannel();

      await new Promise<void>(resolve => {
        publishOnConfirmChannel(channel, {
          onBrokerConfirm: cb =>
            setImmediate(() => {
              cb(null);
              resolve();
            }),
        });
      });

      tracingChannel(CHANNELS.AMQPLIB_PUBLISH).traceSync(() => true, {
        arguments: ['orders', 'plain-key', Buffer.from('payload'), {}],
        self: channel,
      });

      // 1 span for the confirm publish + 1 for the later plain publish. A stuck guard would suppress
      // the second, leaving only 1.
      expect(startInactiveSpanSpy).toHaveBeenCalledTimes(2);
    });

    it('does not end the producer span until the broker confirm callback fires', () => {
      const channel = makeChannel();
      let brokerConfirm: (err?: unknown) => void = () => {};

      publishOnConfirmChannel(channel, {
        onBrokerConfirm: cb => {
          brokerConfirm = cb;
        },
      });

      expect(span.end).not.toHaveBeenCalled();

      brokerConfirm(null);

      expect(span.end).toHaveBeenCalledTimes(1);
    });
  });

  describe('consumer span lifecycle', () => {
    async function registerConsumer(channel: unknown, consumerTag: string, noAck: boolean): Promise<void> {
      await tracingChannel(CHANNELS.AMQPLIB_CONSUME).tracePromise(async () => ({ consumerTag }), {
        arguments: ['task-queue', () => {}, { noAck }],
        self: channel,
      });
    }

    it('runs the consumer callback under the consumer span', async () => {
      const channel = makeChannel();
      await registerConsumer(channel, 'ct-active', false);
      const message = { fields: { exchange: '', routingKey: 'task-queue' }, properties: { headers: {} } };

      let activeDuringCallback: Span | undefined;
      tracingChannel(CHANNELS.AMQPLIB_DISPATCH).traceSync(
        () => {
          activeDuringCallback = SentryCore.getActiveSpan();
        },
        { arguments: [{ consumerTag: 'ct-active' }, message], self: channel },
      );

      expect(activeDuringCallback).toBe(span);
    });

    it('noAck consumer: ends the span when dispatch returns, even if the callback is async', async () => {
      const channel = makeChannel();
      await registerConsumer(channel, 'ct-async', true);
      const message = { fields: { exchange: '', routingKey: 'task-queue' }, properties: { headers: {} } };

      let resolveWork: () => void = () => {};
      const asyncWork = new Promise<void>(resolve => {
        resolveWork = resolve;
      });

      tracingChannel(CHANNELS.AMQPLIB_DISPATCH).traceSync(() => asyncWork, {
        arguments: [{ consumerTag: 'ct-async' }, message],
        self: channel,
      });

      // The span closes when the synchronous dispatch returns, not when the async work settles.
      expect(span.end).toHaveBeenCalledTimes(1);

      resolveWork();
      await asyncWork;
    });

    it('manual-ack consumer: keeps the span open across the dispatch and ends it on ack', async () => {
      const channel = makeChannel();
      await registerConsumer(channel, 'ct-manual', false);
      const message = { fields: { exchange: '', routingKey: 'task-queue' }, properties: { headers: {} } };

      tracingChannel(CHANNELS.AMQPLIB_DISPATCH).traceSync(() => undefined, {
        arguments: [{ consumerTag: 'ct-manual' }, message],
        self: channel,
      });

      expect(span.end).not.toHaveBeenCalled();

      tracingChannel(CHANNELS.AMQPLIB_ACK).traceSync(() => undefined, { arguments: [message], self: channel });

      expect(span.end).toHaveBeenCalledTimes(1);
    });
  });

  // The `connect` channel stashes connection attributes derived from the connect URL onto the
  // connection object; the producer span then reads them via `channel.connection`. A silent
  // regression here would drop everything except `messaging.system` (which has a live-object
  // fallback), so these assert the full URL-derived attribute set flows onto the span.
  describe('connection attributes', () => {
    function connect(url: unknown, connection: unknown): void {
      tracingChannel(CHANNELS.AMQPLIB_CONNECT).traceCallback(
        function (_url: unknown, _opts: unknown, cb: (err: unknown, conn: unknown) => void) {
          cb(null, connection);
        },
        2,
        { arguments: [url] },
        undefined,
        url,
        {},
        () => {},
      );
    }

    it.each([
      {
        name: 'string url with credentials (password censored)',
        url: 'amqp://user:secret@rabbit.example.com:5672/vhost',
        expected: {
          'messaging.url': 'amqp://user:***@rabbit.example.com:5672/vhost',
          'messaging.protocol': 'AMQP',
          'messaging.protocol_version': '0.9.1',
          'net.peer.name': 'rabbit.example.com',
          'net.peer.port': 5672,
        },
      },
      {
        name: 'amqps string url defaulting to port 5671',
        url: 'amqps://rabbit.example.com/',
        expected: {
          'messaging.protocol': 'AMQPS',
          'net.peer.name': 'rabbit.example.com',
          'net.peer.port': 5671,
        },
      },
      {
        name: 'object connect options',
        url: { protocol: 'amqp', hostname: 'broker.internal', port: 5673 },
        expected: {
          'messaging.protocol': 'AMQP',
          'net.peer.name': 'broker.internal',
          'net.peer.port': 5673,
        },
      },
    ])('carries $name onto the producer span', ({ url, expected }) => {
      const connection = { serverProperties: { product: 'RabbitMQ' } };
      connect(url, connection);

      tracingChannel(CHANNELS.AMQPLIB_PUBLISH).traceSync(() => true, {
        arguments: ['orders', 'routing-key', Buffer.from('payload'), {}],
        self: { connection },
      });

      expect(startInactiveSpanSpy).toHaveBeenCalledTimes(1);
      const options = startInactiveSpanSpy.mock.calls[0]![0] as { attributes: Record<string, unknown> };
      expect(options.attributes).toMatchObject({ ...expected, 'messaging.system': 'rabbitmq' });
    });
  });
});
