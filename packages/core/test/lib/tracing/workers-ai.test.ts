import { describe, expect, it, vi } from 'vitest';
import { instrumentWorkersAiClient } from '../../../src/tracing/workers-ai';

describe('instrumentWorkersAiClient', () => {
  it('passes through non-run methods bound to the original client', () => {
    class FakeAi {
      #internal = 'secret';

      public run = vi.fn().mockResolvedValue({ response: 'ok' });

      public readInternal(): string {
        return this.#internal;
      }
    }

    const client = new FakeAi();
    const instrumented = instrumentWorkersAiClient(client);

    expect(instrumented.readInternal()).toBe('secret');
  });

  it('creates a span and forwards arguments for run calls', async () => {
    const client = { run: vi.fn().mockResolvedValue({ response: 'Paris' }) };
    const instrumented = instrumentWorkersAiClient(client);

    const result = await instrumented.run('@cf/meta/llama-3.1-8b-instruct', { prompt: 'Hello' });

    expect(client.run).toHaveBeenCalledWith('@cf/meta/llama-3.1-8b-instruct', { prompt: 'Hello' });
    expect(result).toEqual({ response: 'Paris' });
  });
});
