import type { Queue } from '@cloudflare/workers-types';
import * as SentryCore from '@sentry/core';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { instrumentQueueProducer } from '../../../src/instrumentations/worker/instrumentQueueProducer';

function createMockQueue(): Queue {
  return {
    send: vi.fn().mockResolvedValue(undefined),
    sendBatch: vi.fn().mockResolvedValue(undefined),
  } as unknown as Queue;
}

describe('instrumentQueueProducer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('send', () => {
    test('forwards the call to the underlying queue', async () => {
      const queue = createMockQueue();
      const wrapped = instrumentQueueProducer(queue, 'MY_QUEUE');

      await wrapped.send({ hello: 'world' }, { contentType: 'json' });

      expect(queue.send).toHaveBeenCalledTimes(1);
      expect(queue.send).toHaveBeenLastCalledWith({ hello: 'world' }, { contentType: 'json' });
    });

    test('starts a queue.publish span with messaging attributes', async () => {
      const startSpanSpy = vi.spyOn(SentryCore, 'startSpan');
      const queue = createMockQueue();
      const wrapped = instrumentQueueProducer(queue, 'MY_QUEUE');

      await wrapped.send('hello');

      expect(startSpanSpy).toHaveBeenCalledTimes(1);
      const [spanCtx] = startSpanSpy.mock.calls[0]!;
      expect(spanCtx).toMatchObject({
        op: 'queue.publish',
        name: 'send MY_QUEUE',
        attributes: {
          'messaging.system': 'cloudflare',
          'messaging.destination.name': 'MY_QUEUE',
          'messaging.operation.type': 'send',
          'messaging.operation.name': 'send',
          'messaging.message.body.size': 5,
          'sentry.op': 'queue.publish',
          'sentry.origin': 'auto.faas.cloudflare.queue',
        },
      });
    });

    test('computes body size for object payloads via JSON.stringify', async () => {
      const startSpanSpy = vi.spyOn(SentryCore, 'startSpan');
      const queue = createMockQueue();
      const wrapped = instrumentQueueProducer(queue, 'MY_QUEUE');

      await wrapped.send({ a: 1 });

      const attrs = startSpanSpy.mock.calls[0]![0].attributes!;
      expect(attrs['messaging.message.body.size']).toBe(JSON.stringify({ a: 1 }).length);
    });

    test('computes body size for ArrayBuffer payloads', async () => {
      const startSpanSpy = vi.spyOn(SentryCore, 'startSpan');
      const queue = createMockQueue();
      const wrapped = instrumentQueueProducer(queue, 'MY_QUEUE');

      const buf = new ArrayBuffer(42);
      await wrapped.send(buf);

      const attrs = startSpanSpy.mock.calls[0]![0].attributes!;
      expect(attrs['messaging.message.body.size']).toBe(42);
    });

    test('omits body size when payload cannot be serialized', async () => {
      const startSpanSpy = vi.spyOn(SentryCore, 'startSpan');
      const queue = createMockQueue();
      const wrapped = instrumentQueueProducer(queue, 'MY_QUEUE');

      // Circular reference - JSON.stringify throws
      const circular: Record<string, unknown> = {};
      circular.self = circular;
      await wrapped.send(circular);

      const attrs = startSpanSpy.mock.calls[0]![0].attributes!;
      expect(attrs['messaging.message.body.size']).toBeUndefined();
    });
  });

  describe('sendBatch', () => {
    test('forwards the call to the underlying queue', async () => {
      const queue = createMockQueue();
      const wrapped = instrumentQueueProducer(queue, 'MY_QUEUE');

      await wrapped.sendBatch([{ body: 'a' }, { body: 'b' }]);

      expect(queue.sendBatch).toHaveBeenCalledTimes(1);
    });

    test('starts a queue.publish span with batch attributes', async () => {
      const startSpanSpy = vi.spyOn(SentryCore, 'startSpan');
      const queue = createMockQueue();
      const wrapped = instrumentQueueProducer(queue, 'MY_QUEUE');

      await wrapped.sendBatch([{ body: 'aa' }, { body: 'bbb' }]);

      expect(startSpanSpy).toHaveBeenCalledTimes(1);
      const [spanCtx] = startSpanSpy.mock.calls[0]!;
      expect(spanCtx).toMatchObject({
        op: 'queue.publish',
        name: 'send MY_QUEUE',
        attributes: {
          'messaging.system': 'cloudflare',
          'messaging.destination.name': 'MY_QUEUE',
          'messaging.operation.type': 'send',
          'messaging.operation.name': 'send',
          'messaging.batch.message_count': 2,
          'messaging.message.body.size': 5,
          'sentry.op': 'queue.publish',
          'sentry.origin': 'auto.faas.cloudflare.queue',
        },
      });
    });

    test('handles iterables (not just arrays)', async () => {
      const queue = createMockQueue();
      const wrapped = instrumentQueueProducer(queue, 'MY_QUEUE');

      function* gen() {
        yield { body: 'a' };
        yield { body: 'b' };
      }

      await wrapped.sendBatch(gen());

      expect(queue.sendBatch).toHaveBeenCalledTimes(1);
      const passed = (queue.sendBatch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(Array.isArray(passed)).toBe(true);
      expect(passed).toHaveLength(2);
    });

    test('omits body size when all payloads cannot be serialized', async () => {
      const startSpanSpy = vi.spyOn(SentryCore, 'startSpan');
      const queue = createMockQueue();
      const wrapped = instrumentQueueProducer(queue, 'MY_QUEUE');

      const circular1: Record<string, unknown> = {};
      circular1.self = circular1;
      const circular2: Record<string, unknown> = {};
      circular2.self = circular2;

      await wrapped.sendBatch([{ body: circular1 }, { body: circular2 }]);

      const attrs = startSpanSpy.mock.calls[0]![0].attributes!;
      expect(attrs['messaging.message.body.size']).toBeUndefined();
    });

    test('sums only sizable bodies when batch contains mixed payloads', async () => {
      const startSpanSpy = vi.spyOn(SentryCore, 'startSpan');
      const queue = createMockQueue();
      const wrapped = instrumentQueueProducer(queue, 'MY_QUEUE');

      const circular: Record<string, unknown> = {};
      circular.self = circular;

      await wrapped.sendBatch([{ body: 'aa' }, { body: circular }, { body: 'bbb' }]);

      const attrs = startSpanSpy.mock.calls[0]![0].attributes!;
      expect(attrs['messaging.message.body.size']).toBe(5);
    });
  });

  test('forwards unknown property accesses transparently', () => {
    const queue = Object.assign(createMockQueue(), {
      customMethod: vi.fn().mockReturnValue('hi'),
    }) as unknown as Queue & {
      customMethod: () => string;
    };
    const wrapped = instrumentQueueProducer(queue, 'MY_QUEUE') as Queue & { customMethod: () => string };
    expect(wrapped.customMethod()).toBe('hi');
  });
});
