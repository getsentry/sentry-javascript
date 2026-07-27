import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentScope, getGlobalScope, getIsolationScope, setCurrentClient, startSpan } from '../../../src';
import { addVercelAiProcessors } from '../../../src/tracing/vercel-ai';
import { AI_OPERATION_ID_ATTRIBUTE } from '../../../src/tracing/vercel-ai/vercel-ai-attributes';
import { instrumentWorkersAiClient } from '../../../src/tracing/workers-ai';
import { _INTERNAL_clearAiProviderSkips } from '../../../src/utils/ai/providerSkip';
import { spanToJSON } from '../../../src/utils/spanUtils';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

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

  describe('when the Vercel AI SDK drives the binding', () => {
    let spans: string[];

    /** Set up a client with the Vercel AI processors registered, recording every ended span. */
    function setupClient(): void {
      getCurrentScope().clear();
      getIsolationScope().clear();
      getGlobalScope().clear();

      spans = [];
      const client = new TestClient(getDefaultTestClientOptions({ tracesSampleRate: 1 }));
      client.on('spanEnd', span => {
        spans.push(spanToJSON(span).description ?? '');
      });
      setCurrentClient(client);
      addVercelAiProcessors(client);
    }

    beforeEach(() => {
      _INTERNAL_clearAiProviderSkips();
      setupClient();
    });

    afterEach(() => {
      _INTERNAL_clearAiProviderSkips();
    });

    /**
     * Emit the span the `ai` SDK creates for a model call. Its `spanStart` handler is what marks
     * Workers AI as skipped, exactly as it would at runtime.
     */
    async function withVercelAiModelCall(callback: () => Promise<unknown>): Promise<void> {
      await startSpan(
        { name: 'ai.streamText.doStream', attributes: { [AI_OPERATION_ID_ATTRIBUTE]: 'ai.streamText.doStream' } },
        async () => {
          await callback();
        },
      );
    }

    it('does not create a duplicate span for the nested `run` call', async () => {
      const client = { run: vi.fn().mockResolvedValue({ response: 'Paris' }) };
      const instrumented = instrumentWorkersAiClient(client);

      await withVercelAiModelCall(() => instrumented.run('@cf/meta/llama-3.1-8b-instruct', { prompt: 'Hello' }));

      // The call is forwarded, but no duplicate `gen_ai.chat` span is emitted — only the
      // Vercel AI model-call span remains.
      expect(client.run).toHaveBeenCalledWith('@cf/meta/llama-3.1-8b-instruct', { prompt: 'Hello' });
      expect(spans).not.toContain('chat @cf/meta/llama-3.1-8b-instruct');
      expect(spans).toEqual(['streamText.doStream']);
    });

    it('still creates a span for a direct `run` call made before any Vercel AI call', async () => {
      const client = { run: vi.fn().mockResolvedValue({ response: 'Paris' }) };
      const instrumented = instrumentWorkersAiClient(client);

      await startSpan({ name: 'root' }, () => instrumented.run('@cf/meta/llama-3.1-8b-instruct', { prompt: 'Hello' }));

      expect(spans).toContain('chat @cf/meta/llama-3.1-8b-instruct');
    });

    it('clears the skip between clients so a later isolate reuse is unaffected', async () => {
      const client = { run: vi.fn().mockResolvedValue({ response: 'Paris' }) };
      const instrumented = instrumentWorkersAiClient(client);

      // First request: the `ai` SDK runs and marks Workers AI as skipped.
      await withVercelAiModelCall(() => instrumented.run('@cf/meta/llama-3.1-8b-instruct', { prompt: 'Hello' }));
      expect(spans).not.toContain('chat @cf/meta/llama-3.1-8b-instruct');

      // Second request on the same isolate: `_setupIntegrations` resets the registry, so a direct
      // `env.AI.run` call must get its span back. Without the reset this would stay suppressed.
      _INTERNAL_clearAiProviderSkips();
      setupClient();

      await startSpan({ name: 'root' }, () => instrumented.run('@cf/meta/llama-3.1-8b-instruct', { prompt: 'Hello' }));

      expect(spans).toContain('chat @cf/meta/llama-3.1-8b-instruct');
    });
  });
});
