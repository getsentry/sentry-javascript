import { describe, expect, it, vi } from 'vitest';

describe('diagnosticsChannelShim', () => {
  it('shares one registry between two loaded copies of the module', async () => {
    const first = await import('../../src/v3/client/diagnosticsChannelShim');
    const seen: unknown[] = [];
    first.tracingChannel('orchestrion:test:run').subscribe({ end: context => void seen.push(context) });

    // A second module instance, as a browser gets when the same file is loaded under two URLs.
    vi.resetModules();
    const second = await import('../../src/v3/client/diagnosticsChannelShim');
    expect(second.tracingChannel).not.toBe(first.tracingChannel);

    second.tracingChannel('orchestrion:test:run').end.publish({ result: 1 });

    expect(seen).toEqual([{ result: 1 }]);
  });
});
