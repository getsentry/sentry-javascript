import {
  SENTRY_SEGMENT_NAME_SOURCE,
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_RESPONSE_TEXT,
  GEN_AI_SYSTEM_INSTRUCTIONS,
} from '@sentry/conventions/attributes';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getMainCarrier,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  setCurrentClient,
  spanToStaticSpanJSON,
} from '@sentry/core';
import type { DataCollection, Span } from '@sentry/core';
import { instrumentWorkersAiClient } from '../../../../src/ai/workers-ai';
import { getDefaultTestClientOptions, TestClient } from '../../../mocks/client';

const MODEL = '@cf/meta/llama-3.1-8b-instruct';

describe('instrumentWorkersAiClient', () => {
  beforeEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
  });

  afterEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
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

    const result = await instrumented.run(MODEL, { prompt: 'Hello' });

    expect(client.run).toHaveBeenCalledWith(MODEL, { prompt: 'Hello' });
    expect(result).toEqual({ response: 'Paris' });
  });

  describe('message recording', () => {
    /**
     * Attributes recorded regardless of the `genAI` data collection settings. Sample rate and source
     * are on here because the `run` call is the root span in these tests, with no active parent.
     */
    const ALWAYS_RECORDED = {
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.cloudflare.workers_ai',
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
      [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
      [SENTRY_SEGMENT_NAME_SOURCE]: 'custom',
      [GEN_AI_PROVIDER_NAME]: 'cloudflare.workers_ai',
      [GEN_AI_OPERATION_NAME]: 'chat',
      [GEN_AI_REQUEST_MODEL]: MODEL,
    };

    /** Everything gated behind `recordInputs`. The system message is split into its own attribute. */
    const PROMPT_ATTRIBUTES = {
      [GEN_AI_SYSTEM_INSTRUCTIONS]: '[{"type":"text","content":"Answer in one word."}]',
      [GEN_AI_INPUT_MESSAGES]: '[{"role":"user","content":"Capital of France?"}]',
    };

    /** Everything gated behind `recordOutputs`. */
    const RESPONSE_ATTRIBUTES = {
      [GEN_AI_OUTPUT_MESSAGES]: '[{"role":"assistant","parts":[{"type":"text","content":"Paris"}]}]',
      [GEN_AI_RESPONSE_TEXT]: 'Paris',
    };

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

    // `@sentry/cloudflare` instruments the `env.AI` binding on first property access, which happens
    // inside the request — after `withSentry` has initialized the SDK. These cases wrap in that same
    // order so `dataCollection.genAI` is readable when recording options are resolved.
    it.each([
      {
        name: 'collects prompts and responses when dataCollection is unset',
        dataCollection: undefined,
        options: undefined,
        expected: { ...ALWAYS_RECORDED, ...PROMPT_ATTRIBUTES, ...RESPONSE_ATTRIBUTES },
      },
      {
        name: 'omits prompts and responses when dataCollection.genAI disables both',
        dataCollection: { genAI: { inputs: false, outputs: false } },
        options: undefined,
        expected: ALWAYS_RECORDED,
      },
      {
        name: 'records prompts only when dataCollection.genAI enables inputs alone',
        dataCollection: { genAI: { inputs: true, outputs: false } },
        options: undefined,
        expected: { ...ALWAYS_RECORDED, ...PROMPT_ATTRIBUTES },
      },
      {
        name: 'records responses only when dataCollection.genAI enables outputs alone',
        dataCollection: { genAI: { inputs: false, outputs: true } },
        options: undefined,
        expected: { ...ALWAYS_RECORDED, ...RESPONSE_ATTRIBUTES },
      },
      {
        name: 'defaults the unspecified half of dataCollection.genAI to collecting',
        dataCollection: { genAI: { inputs: false } },
        options: undefined,
        expected: { ...ALWAYS_RECORDED, ...RESPONSE_ATTRIBUTES },
      },
      {
        name: 'prefers explicit recording options over dataCollection.genAI',
        dataCollection: { genAI: { inputs: true, outputs: true } },
        options: { recordInputs: false, recordOutputs: false },
        expected: ALWAYS_RECORDED,
      },
    ])('$name', async ({ dataCollection, options, expected }) => {
      const endedSpans = setupClient(dataCollection);

      const client = { run: vi.fn().mockResolvedValue({ response: 'Paris' }) };
      const instrumented = instrumentWorkersAiClient(client, options);

      await instrumented.run(MODEL, {
        messages: [
          { role: 'system', content: 'Answer in one word.' },
          { role: 'user', content: 'Capital of France?' },
        ],
      });

      expect(endedSpans).toHaveLength(1);
      expect(spanToStaticSpanJSON(endedSpans[0]!).data).toEqual(expected);
    });
  });
});
