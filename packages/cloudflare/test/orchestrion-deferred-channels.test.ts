import { describe, expect, it, vi } from 'vitest';

const { realChannel, workerd } = vi.hoisted(() => {
  const workerd = { inGlobalScope: true };
  const subChannel = () => ({
    name: 'test',
    hasSubscribers: false,
    publish: vi.fn((_ctx: Record<string, unknown>) => {
      if (workerd.inGlobalScope) {
        throw new Error('Disallowed operation called within global scope.');
      }
    }),
    runStores: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    bindStore: vi.fn(),
    unbindStore: vi.fn(),
  });
  const realChannel = {
    start: subChannel(),
    end: subChannel(),
    asyncStart: subChannel(),
    asyncEnd: subChannel(),
    error: subChannel(),
    traceSync: vi.fn(),
    tracePromise: vi.fn(),
    traceCallback: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  };
  return { realChannel, workerd };
});

vi.mock('node:diagnostics_channel', () => ({
  tracingChannel: () => realChannel,
  channel: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
}));

describe('deferred channel events', () => {
  it('publishes the events that another copy of the SDK deferred', async () => {
    // A bundle can hold the CommonJS build of the facade, which defers, and the ES module build of the request
    // wrapper, which flushes.
    const deferringCopy = await import('../src/orchestrion-diagnostics-channel');
    vi.resetModules();
    const flushingCopy = await import('../src/orchestrion-deferred-channels');

    const ctx = { arguments: ['/users/:id'] };
    deferringCopy.tracingChannel('test').start.publish(ctx);
    realChannel.start.publish.mockClear();

    workerd.inGlobalScope = false;
    flushingCopy.flushDeferredChannelEvents();

    expect(realChannel.start.publish).toHaveBeenCalledExactlyOnceWith(ctx);
    expect(realChannel.end.publish).toHaveBeenCalledExactlyOnceWith(ctx);
    expect(realChannel.error.publish).not.toHaveBeenCalled();

    flushingCopy.flushDeferredChannelEvents();

    expect(realChannel.start.publish).toHaveBeenCalledTimes(1);
  });
});
