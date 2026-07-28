import { GEN_AI_INPUT_MESSAGES, GEN_AI_OUTPUT_MESSAGES } from '@sentry/conventions/attributes';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Span } from '../../../src';
import { getCurrentScope, getGlobalScope, getIsolationScope, setCurrentClient, spanToJSON } from '../../../src';
import { instrumentWorkersAiClient } from '../../../src/tracing/workers-ai';
import type { DataCollection } from '../../../src/types/datacollection';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

function setupClient(dataCollection?: DataCollection): Span[] {
  const client = new TestClient(
    getDefaultTestClientOptions({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
      tracesSampleRate: 1,
      dataCollection,
    }),
  );
  setCurrentClient(client);
  client.init();

  const endedSpans: Span[] = [];
  client.on('spanEnd', span => endedSpans.push(span));
  return endedSpans;
}

describe('instrumentWorkersAiClient', () => {
  beforeEach(() => {
    getCurrentScope().clear();
    getIsolationScope().clear();
    getGlobalScope().clear();
  });

  afterEach(() => {
    getCurrentScope().clear();
    getIsolationScope().clear();
    getGlobalScope().clear();
  });

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

  // `@sentry/cloudflare` wraps the `env.AI` binding outside of a request, which can run before
  // `withSentry` initializes the SDK. Recording options must therefore be resolved per `run` call,
  // otherwise `dataCollection.genAI` is silently ignored for the lifetime of the isolate.
  it('honors dataCollection.genAI when the binding is wrapped before the SDK is initialized', async () => {
    const client = { run: vi.fn().mockResolvedValue({ response: 'Paris' }) };
    const instrumented = instrumentWorkersAiClient(client);

    const endedSpans = setupClient({ genAI: { inputs: false, outputs: false } });

    await instrumented.run('@cf/meta/llama-3.1-8b-instruct', { messages: [{ role: 'user', content: 'Hello' }] });

    expect(endedSpans).toHaveLength(1);
    const data = spanToJSON(endedSpans[0]!).data;
    expect(data[GEN_AI_INPUT_MESSAGES]).toBeUndefined();
    expect(data[GEN_AI_OUTPUT_MESSAGES]).toBeUndefined();
  });

  it('records inputs and outputs when dataCollection.genAI enables them', async () => {
    const client = { run: vi.fn().mockResolvedValue({ response: 'Paris' }) };
    const instrumented = instrumentWorkersAiClient(client);

    const endedSpans = setupClient({ genAI: { inputs: true, outputs: true } });

    await instrumented.run('@cf/meta/llama-3.1-8b-instruct', { messages: [{ role: 'user', content: 'Hello' }] });

    expect(endedSpans).toHaveLength(1);
    const data = spanToJSON(endedSpans[0]!).data;
    expect(data[GEN_AI_INPUT_MESSAGES]).toBe('[{"role":"user","content":"Hello"}]');
    expect(data[GEN_AI_OUTPUT_MESSAGES]).toBe('[{"role":"assistant","parts":[{"type":"text","content":"Paris"}]}]');
  });

  it('prefers explicit recording options over dataCollection.genAI', async () => {
    const client = { run: vi.fn().mockResolvedValue({ response: 'Paris' }) };
    const instrumented = instrumentWorkersAiClient(client, { recordInputs: false, recordOutputs: false });

    const endedSpans = setupClient({ genAI: { inputs: true, outputs: true } });

    await instrumented.run('@cf/meta/llama-3.1-8b-instruct', { messages: [{ role: 'user', content: 'Hello' }] });

    expect(endedSpans).toHaveLength(1);
    const data = spanToJSON(endedSpans[0]!).data;
    expect(data[GEN_AI_INPUT_MESSAGES]).toBeUndefined();
    expect(data[GEN_AI_OUTPUT_MESSAGES]).toBeUndefined();
  });
});
