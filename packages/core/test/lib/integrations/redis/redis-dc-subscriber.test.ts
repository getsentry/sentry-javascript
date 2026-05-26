import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _resetRedisDiagnosticChannelsForTesting,
  IOREDIS_DC_CHANNEL_COMMAND,
  IOREDIS_DC_CHANNEL_CONNECT,
  REDIS_DC_CHANNEL_BATCH,
  REDIS_DC_CHANNEL_COMMAND,
  REDIS_DC_CHANNEL_CONNECT,
  subscribeRedisDiagnosticChannels,
  type RedisTracingChannel,
  type RedisTracingChannelFactory,
  type RedisTracingChannelSubscribers,
} from '../../../../src/integrations/redis/redis-dc-subscriber';
import { SPAN_STATUS_ERROR } from '../../../../src/tracing/spanstatus';

interface RecordedChannel {
  subs: Partial<RedisTracingChannelSubscribers<unknown>>;
}

// fake tracing-channel factory that stores subscribers in channels by name
function makeFakeFactory(): {
  factory: RedisTracingChannelFactory;
  channels: Record<string, RecordedChannel>;
} {
  const channels: Record<string, RecordedChannel> = {};
  const factory: RedisTracingChannelFactory = (name, _transform) => {
    const recorded: RecordedChannel = { subs: {} };
    channels[name] = recorded;
    return {
      subscribe(subs: Partial<RedisTracingChannelSubscribers<unknown>>) {
        Object.assign(recorded.subs, subs);
      },
    } as unknown as RedisTracingChannel<object>;
  };
  return { factory, channels };
}

function makeSpan() {
  return {
    end: vi.fn(),
    setStatus: vi.fn(),
    setAttribute: vi.fn(),
    setAttributes: vi.fn(),
    updateName: vi.fn(),
    spanContext: () => ({ spanId: 'test-span-id', traceId: 'test-trace-id', traceFlags: 1 }),
  };
}

describe('subscribeRedisDiagnosticChannels', () => {
  let factory: RedisTracingChannelFactory;
  let channels: Record<string, RecordedChannel>;
  let mockSpan: ReturnType<typeof makeSpan>;
  let responseHook: ReturnType<typeof vi.fn>;

  const subs = (name: string) =>
    channels[name]!.subs as {
      asyncEnd: (data: any) => void;
      error: (data: any) => void;
    };

  beforeEach(() => {
    _resetRedisDiagnosticChannelsForTesting();
    ({ factory, channels } = makeFakeFactory());
    mockSpan = makeSpan();
    responseHook = vi.fn();
    subscribeRedisDiagnosticChannels(factory, responseHook);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('node-redis command channel', () => {
    describe('asyncEnd (success path)', () => {
      it('calls the response hook with sliced args and ends the span', () => {
        const data = {
          command: 'GET',
          args: ['GET', 'cache:key'],
          result: 'hit-value',
          _sentrySpan: mockSpan,
        };
        subs(REDIS_DC_CHANNEL_COMMAND).asyncEnd(data);

        expect(responseHook).toHaveBeenCalledWith(mockSpan, 'GET', ['cache:key'], 'hit-value');
        expect(mockSpan.end).toHaveBeenCalledTimes(1);
      });

      it('strips the command name from args before passing to the response hook', () => {
        const data = {
          command: 'MGET',
          args: ['MGET', 'key1', 'key2', 'key3'],
          result: ['v1', 'v2', 'v3'],
          _sentrySpan: mockSpan,
        };
        subs(REDIS_DC_CHANNEL_COMMAND).asyncEnd(data);

        expect(responseHook).toHaveBeenCalledWith(mockSpan, 'MGET', ['key1', 'key2', 'key3'], ['v1', 'v2', 'v3']);
      });

      it('bails early when _sentrySpan is absent', () => {
        subs(REDIS_DC_CHANNEL_COMMAND).asyncEnd({ command: 'GET', args: ['GET', 'k'], result: 'v' });

        expect(responseHook).not.toHaveBeenCalled();
        expect(mockSpan.end).not.toHaveBeenCalled();
      });
    });

    describe('error path', () => {
      it('sets error status and ends the span in the error handler', () => {
        const error = new Error('ECONNREFUSED');
        const data = { command: 'SET', args: ['SET', 'k', 'v'], error, _sentrySpan: mockSpan };
        subs(REDIS_DC_CHANNEL_COMMAND).error(data);

        expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SPAN_STATUS_ERROR, message: 'ECONNREFUSED' });
        expect(mockSpan.end).toHaveBeenCalledTimes(1);
      });

      it('does not call the response hook or end the span a second time in asyncEnd when error is set', () => {
        const error = new Error('ECONNREFUSED');
        const data = { command: 'GET', args: ['GET', 'k'], error, _sentrySpan: mockSpan };

        // TracingChannel fires error first, then asyncEnd, on the same data object.
        subs(REDIS_DC_CHANNEL_COMMAND).error(data);
        subs(REDIS_DC_CHANNEL_COMMAND).asyncEnd(data);

        expect(responseHook).not.toHaveBeenCalled();
        expect(mockSpan.end).toHaveBeenCalledTimes(1);
      });

      it('bails early in error handler when _sentrySpan is absent', () => {
        subs(REDIS_DC_CHANNEL_COMMAND).error({ command: 'GET', args: ['GET', 'k'], error: new Error('x') });

        expect(mockSpan.setStatus).not.toHaveBeenCalled();
        expect(mockSpan.end).not.toHaveBeenCalled();
      });
    });
  });

  describe('node-redis batch channel', () => {
    describe('asyncEnd (success path)', () => {
      it('ends the span', () => {
        const data = { batchMode: 'PIPELINE', batchSize: 3, _sentrySpan: mockSpan };
        subs(REDIS_DC_CHANNEL_BATCH).asyncEnd(data);

        expect(mockSpan.end).toHaveBeenCalledTimes(1);
      });

      it('bails early when _sentrySpan is absent', () => {
        subs(REDIS_DC_CHANNEL_BATCH).asyncEnd({ batchMode: 'MULTI' });

        expect(mockSpan.end).not.toHaveBeenCalled();
      });
    });

    describe('error path', () => {
      it('sets error status and ends the span in the error handler', () => {
        const error = new Error('MULTI aborted');
        const data = { batchMode: 'MULTI', error, _sentrySpan: mockSpan };
        subs(REDIS_DC_CHANNEL_BATCH).error(data);

        expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SPAN_STATUS_ERROR, message: 'MULTI aborted' });
        expect(mockSpan.end).toHaveBeenCalledTimes(1);
      });

      it('does not end the span a second time in asyncEnd when error is set', () => {
        const error = new Error('MULTI aborted');
        const data = { batchMode: 'MULTI', error, _sentrySpan: mockSpan };

        subs(REDIS_DC_CHANNEL_BATCH).error(data);
        subs(REDIS_DC_CHANNEL_BATCH).asyncEnd(data);

        expect(mockSpan.end).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('node-redis connect channel', () => {
    describe('asyncEnd (success path)', () => {
      it('ends the span', () => {
        const data = { serverAddress: '127.0.0.1', serverPort: 6379, _sentrySpan: mockSpan };
        subs(REDIS_DC_CHANNEL_CONNECT).asyncEnd(data);

        expect(mockSpan.end).toHaveBeenCalledTimes(1);
      });

      it('bails early when _sentrySpan is absent', () => {
        subs(REDIS_DC_CHANNEL_CONNECT).asyncEnd({ serverAddress: '127.0.0.1' });

        expect(mockSpan.end).not.toHaveBeenCalled();
      });
    });

    describe('error path', () => {
      it('sets error status and ends the span in the error handler', () => {
        const error = new Error('connect ECONNREFUSED');
        const data = { serverAddress: '127.0.0.1', serverPort: 6379, error, _sentrySpan: mockSpan };
        subs(REDIS_DC_CHANNEL_CONNECT).error(data);

        expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SPAN_STATUS_ERROR, message: 'connect ECONNREFUSED' });
        expect(mockSpan.end).toHaveBeenCalledTimes(1);
      });

      it('does not end the span a second time in asyncEnd when error is set', () => {
        const error = new Error('connect ECONNREFUSED');
        const data = { serverAddress: '127.0.0.1', error, _sentrySpan: mockSpan };

        subs(REDIS_DC_CHANNEL_CONNECT).error(data);
        subs(REDIS_DC_CHANNEL_CONNECT).asyncEnd(data);

        expect(mockSpan.end).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('ioredis command channel', () => {
    it('calls the response hook with args as published by ioredis (no slicing)', () => {
      const data = {
        command: 'get',
        args: ['cache:key'],
        result: 'hit-value',
        _sentrySpan: mockSpan,
      };
      subs(IOREDIS_DC_CHANNEL_COMMAND).asyncEnd(data);

      expect(responseHook).toHaveBeenCalledWith(mockSpan, 'get', ['cache:key'], 'hit-value');
      expect(mockSpan.end).toHaveBeenCalledTimes(1);
    });

    it('does not slice the first arg for ioredis command payloads', () => {
      const data = {
        command: 'mget',
        args: ['key1', 'key2', 'key3'],
        result: ['v1', 'v2', 'v3'],
        _sentrySpan: mockSpan,
      };
      subs(IOREDIS_DC_CHANNEL_COMMAND).asyncEnd(data);

      expect(responseHook).toHaveBeenCalledWith(mockSpan, 'mget', ['key1', 'key2', 'key3'], ['v1', 'v2', 'v3']);
    });

    it('handles batch metadata on ioredis command payloads without a separate batch channel', () => {
      const data = {
        command: 'set',
        args: ['cache:key', '?'],
        batchMode: 'MULTI',
        batchSize: 2,
        result: 'OK',
        _sentrySpan: mockSpan,
      };
      subs(IOREDIS_DC_CHANNEL_COMMAND).asyncEnd(data);

      expect(channels['ioredis:batch']).toBeUndefined();
      expect(responseHook).toHaveBeenCalledWith(mockSpan, 'set', ['cache:key', '?'], 'OK');
      expect(mockSpan.end).toHaveBeenCalledTimes(1);
    });

    it('sets error status and ends the span in the error handler', () => {
      const error = new Error('WRONGTYPE');
      const data = { command: 'hset', args: ['key', 'field', '?'], error, _sentrySpan: mockSpan };
      subs(IOREDIS_DC_CHANNEL_COMMAND).error(data);

      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SPAN_STATUS_ERROR, message: 'WRONGTYPE' });
      expect(mockSpan.end).toHaveBeenCalledTimes(1);
    });

    it('does not call the response hook or end the span a second time in asyncEnd when error is set', () => {
      const error = new Error('WRONGTYPE');
      const data = { command: 'hset', args: ['key', 'field', '?'], error, _sentrySpan: mockSpan };

      subs(IOREDIS_DC_CHANNEL_COMMAND).error(data);
      subs(IOREDIS_DC_CHANNEL_COMMAND).asyncEnd(data);

      expect(responseHook).not.toHaveBeenCalled();
      expect(mockSpan.end).toHaveBeenCalledTimes(1);
    });
  });

  describe('ioredis connect channel', () => {
    it('ends the span on success', () => {
      const data = { serverAddress: 'localhost', serverPort: 6379, _sentrySpan: mockSpan };
      subs(IOREDIS_DC_CHANNEL_CONNECT).asyncEnd(data);

      expect(mockSpan.end).toHaveBeenCalledTimes(1);
    });

    it('sets error status and ends the span in the error handler', () => {
      const error = new Error('connect ECONNREFUSED');
      const data = { serverAddress: 'localhost', serverPort: 1, error, _sentrySpan: mockSpan };
      subs(IOREDIS_DC_CHANNEL_CONNECT).error(data);

      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SPAN_STATUS_ERROR, message: 'connect ECONNREFUSED' });
      expect(mockSpan.end).toHaveBeenCalledTimes(1);
    });
  });

  describe('idempotency', () => {
    it('does not re-subscribe on a second call, but updates the response hook', () => {
      // First subscription happened in beforeEach. Replay with a new hook —
      // the same channel subscribers stay in place, but the new hook fires.
      const secondHook = vi.fn();
      subscribeRedisDiagnosticChannels(factory, secondHook);

      const data = { command: 'GET', args: ['GET', 'k'], result: 'v', _sentrySpan: mockSpan };
      subs(REDIS_DC_CHANNEL_COMMAND).asyncEnd(data);

      expect(secondHook).toHaveBeenCalledTimes(1);
      expect(responseHook).not.toHaveBeenCalled();
    });
  });
});
