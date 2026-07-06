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
});
