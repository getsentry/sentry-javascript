import { channel } from 'node:diagnostics_channel';
import { describe, expect, test } from 'bun:test';
import { init } from '../../src';

const EXPRESS_HANDLE_START = 'tracing:orchestrion:express:handle:start';

function nextTask(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

describe('channel-based integrations', () => {
  // Bun garbage-collects a diagnostics channel that no code references, together with its
  // subscribers. A GC in the same task does not collect it, so the check runs in a later task.
  // See https://github.com/oven-sh/bun/issues/43086
  test('stay subscribed after a garbage collection', async () => {
    init({ dsn: 'https://username@domain/123', tracesSampleRate: 1 });
    await nextTask();

    expect(channel(EXPRESS_HANDLE_START).hasSubscribers).toBe(true);

    Bun.gc(true);
    await nextTask();

    expect(channel(EXPRESS_HANDLE_START).hasSubscribers).toBe(true);
  });
});
