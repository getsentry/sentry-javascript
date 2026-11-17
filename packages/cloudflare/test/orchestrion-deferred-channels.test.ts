import { describe, expect, it, vi } from 'vitest';

describe('deferred channel events', () => {
  it('publishes the events that another copy of the module deferred', async () => {
    // A bundle can hold the CommonJS and the ES module build of this module.
    const deferringCopy = await import('../src/orchestrion-deferred-channels');
    vi.resetModules();
    const flushingCopy = await import('../src/orchestrion-deferred-channels');
    expect(flushingCopy.flushDeferredChannelEvents).not.toBe(deferringCopy.flushDeferredChannelEvents);

    const channel = {
      start: { publish: vi.fn() },
      end: { publish: vi.fn() },
      error: { publish: vi.fn() },
    };
    const ctx = { arguments: ['/users/:id'] };

    deferringCopy.deferChannelEvent(channel, ctx);
    flushingCopy.flushDeferredChannelEvents();

    expect(channel.start.publish).toHaveBeenCalledExactlyOnceWith(ctx);
    expect(channel.end.publish).toHaveBeenCalledExactlyOnceWith(ctx);
    expect(channel.error.publish).not.toHaveBeenCalled();

    deferringCopy.flushDeferredChannelEvents();

    expect(channel.start.publish).toHaveBeenCalledTimes(1);
  });
});
