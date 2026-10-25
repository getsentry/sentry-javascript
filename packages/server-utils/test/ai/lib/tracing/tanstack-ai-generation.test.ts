import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getMainCarrier, setCurrentClient, spanToStaticSpanJSON } from '@sentry/core';
import {
  setGenerationEndAttributes,
  setGenerationResponseAttributes,
  startGenerationSpan,
  TANSTACK_AI_DECIDE,
  TANSTACK_AI_EMBED,
  TANSTACK_AI_RERANK,
} from '../../../../src/ai/tanstack-ai/generation';
import { getDefaultTestClientOptions, TestClient } from '../../../mocks/client';

describe('TanStack AI activities', () => {
  beforeEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
    const client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
        tracesSampleRate: 1,
        traceLifecycle: 'stream',
      }),
    );
    setCurrentClient(client);
    client.init();
  });

  afterEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
  });

  it('opens no span for options without an adapter', () => {
    expect(startGenerationSpan(TANSTACK_AI_EMBED, { input: 'a red guitar' }, {})).toBeUndefined();
  });

  it('reports the provider of an adapter whose name also names the API', () => {
    const span = startGenerationSpan(
      TANSTACK_AI_EMBED,
      {
        adapter: { name: 'bedrock-embed', provider: 'amazon-bedrock', model: 'amazon.titan-embed-text-v2:0' },
        input: 'a',
      },
      {},
    );

    expect(spanToStaticSpanJSON(span!).data['gen_ai.provider.name']).toBe('amazon-bedrock');
  });

  it('marks a call that the app aborted as cancelled', () => {
    const abortController = new AbortController();
    abortController.abort();
    const callOptions = {
      adapter: { name: 'openai', model: 'text-embedding-3-small' },
      input: 'a',
      abortSignal: abortController.signal,
    };
    const span = startGenerationSpan(TANSTACK_AI_EMBED, callOptions, {})!;
    const error = Object.assign(new Error('Request was aborted.'), { name: 'APIUserAbortError' });
    setGenerationEndAttributes(span, TANSTACK_AI_EMBED, { arguments: [callOptions], error }, {});

    expect(spanToStaticSpanJSON(span).status).toBe('cancelled');
  });

  describe('embed', () => {
    it('records the input without media', () => {
      const span = startGenerationSpan(
        TANSTACK_AI_EMBED,
        {
          adapter: { name: 'openai', model: 'text-embedding-3-small' },
          input: [
            'a red guitar',
            [
              { type: 'text', content: 'product photo' },
              { type: 'image', source: { type: 'data', value: 'iVBORw0KGgo', mimeType: 'image/png' } },
            ],
          ],
        },
        {},
      );

      expect(spanToStaticSpanJSON(span!)).toMatchObject({
        description: 'embeddings text-embedding-3-small',
        op: 'gen_ai.embeddings',
        data: {
          'sentry.origin': 'auto.ai.tanstack_ai',
          'gen_ai.operation.name': 'embeddings',
          'gen_ai.provider.name': 'openai',
          'gen_ai.request.model': 'text-embedding-3-small',
          'gen_ai.embeddings.input': '["a red guitar",["product photo",{"type":"image"}]]',
        },
      });
    });

    it('keeps a single string input as it is', () => {
      const span = startGenerationSpan(
        TANSTACK_AI_EMBED,
        { adapter: { name: 'ollama', model: 'nomic-embed-text' }, input: 'a red guitar' },
        {},
      );

      expect(spanToStaticSpanJSON(span!).data['gen_ai.embeddings.input']).toBe('a red guitar');
    });

    it('leaves out the input when inputs are not recorded', () => {
      const span = startGenerationSpan(
        TANSTACK_AI_EMBED,
        { adapter: { name: 'openai', model: 'text-embedding-3-small' }, input: 'a red guitar' },
        { recordInputs: false },
      );

      expect(spanToStaticSpanJSON(span!).data).not.toHaveProperty('gen_ai.embeddings.input');
    });

    it('records the response model, usage and provider cost, but not the id and the output tokens that the adapter made', () => {
      const span = startGenerationSpan(TANSTACK_AI_EMBED, { adapter: { name: 'openai', model: 'm' }, input: 'a' }, {})!;
      setGenerationResponseAttributes(span, TANSTACK_AI_EMBED, {
        id: 'openai-123',
        model: 'text-embedding-3-small',
        embeddings: [{ vector: [0.1], index: 0 }],
        usage: { promptTokens: 8, completionTokens: 0, totalTokens: 8, cost: 0.0001 },
      });

      const { data } = spanToStaticSpanJSON(span);
      expect(data).toMatchObject({
        'gen_ai.response.model': 'text-embedding-3-small',
        'gen_ai.usage.input_tokens': 8,
        'gen_ai.usage.total_tokens': 8,
        'gen_ai.cost.total_tokens': 0.0001,
      });
      expect(data).not.toHaveProperty('gen_ai.response.id');
      expect(data).not.toHaveProperty('gen_ai.usage.output_tokens');
    });
  });

  describe('rerank', () => {
    it('records the total tokens and provider cost, but not the id and the input and output tokens that the adapter made', () => {
      const span = startGenerationSpan(
        TANSTACK_AI_RERANK,
        { adapter: { name: 'openrouter', model: 'cohere/rerank-v3.5' }, query: 'travel laptop', documents: ['a', 'b'] },
        {},
      )!;
      setGenerationResponseAttributes(span, TANSTACK_AI_RERANK, {
        id: 'rerank-1792850464143-k3j9x2a',
        ranking: [{ index: 1, score: 0.9 }],
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 12, cost: 0.002 },
      });

      expect(spanToStaticSpanJSON(span)).toMatchObject({
        description: 'rerank cohere/rerank-v3.5',
        op: 'gen_ai.rerank',
        data: {
          'gen_ai.operation.name': 'rerank',
          'gen_ai.provider.name': 'openrouter',
          'gen_ai.request.model': 'cohere/rerank-v3.5',
          'gen_ai.usage.total_tokens': 12,
          'gen_ai.cost.total_tokens': 0.002,
        },
      });
      const { data } = spanToStaticSpanJSON(span);
      expect(data).not.toHaveProperty('gen_ai.response.id');
      expect(data).not.toHaveProperty('gen_ai.usage.input_tokens');
      expect(data).not.toHaveProperty('gen_ai.usage.output_tokens');
    });
  });

  describe('decide', () => {
    const callOptions = {
      adapter: { name: 'openai', model: 'gpt-6-luna' },
      state: 'I was charged twice.',
      questions: { refund: { type: 'noul', instructions: 'Does the customer ask for a refund?' } },
    };
    const adapterResult = {
      id: 'decision-1',
      model: 'gpt-6-luna-2026-09-01',
      answers: { refund: { type: 'noul', noul: 0.8 } },
      usage: { promptTokens: 30, completionTokens: 4, totalTokens: 34 },
    };
    const result = {
      refund: { type: 'boolean', value: true, probability: 0.8 },
      meta: { id: adapterResult.id, model: adapterResult.model, usage: adapterResult.usage },
    };

    it('records the questions and answers', () => {
      const span = startGenerationSpan(TANSTACK_AI_DECIDE, callOptions, {})!;
      setGenerationResponseAttributes(span, TANSTACK_AI_DECIDE, adapterResult);
      setGenerationEndAttributes(span, TANSTACK_AI_DECIDE, { arguments: [callOptions], result }, {});

      expect(spanToStaticSpanJSON(span)).toMatchObject({
        description: 'decide gpt-6-luna',
        op: 'gen_ai.decide',
        data: {
          'gen_ai.operation.name': 'decide',
          'gen_ai.input.messages':
            '[{"type":"evaluation","state":"I was charged twice.","questions":{"refund":{"type":"noul","instructions":"Does the customer ask for a refund?"}}}]',
          'gen_ai.output.messages':
            '[{"type":"evaluation","answers":{"refund":{"type":"boolean","value":true,"probability":0.8}}}]',
          'gen_ai.response.id': 'decision-1',
          'gen_ai.response.model': 'gpt-6-luna-2026-09-01',
          'gen_ai.usage.input_tokens': 30,
          'gen_ai.usage.output_tokens': 4,
        },
      });
    });

    it('leaves out the questions and answers when inputs and outputs are not recorded', () => {
      const options = { recordInputs: false, recordOutputs: false };
      const span = startGenerationSpan(TANSTACK_AI_DECIDE, callOptions, options)!;
      setGenerationResponseAttributes(span, TANSTACK_AI_DECIDE, adapterResult);
      setGenerationEndAttributes(span, TANSTACK_AI_DECIDE, { arguments: [callOptions], result }, options);

      const { data } = spanToStaticSpanJSON(span);
      expect(data).not.toHaveProperty('gen_ai.input.messages');
      expect(data).not.toHaveProperty('gen_ai.output.messages');
      expect(data['gen_ai.response.model']).toBe('gpt-6-luna-2026-09-01');
    });

    it('records the model and usage of a refused call, which the provider bills', () => {
      const span = startGenerationSpan(TANSTACK_AI_DECIDE, callOptions, {})!;
      const error = Object.assign(new Error('The model refused to answer "refund".'), {
        name: 'EvaluateError',
        model: 'gpt-6-luna-2026-09-01',
        usage: { promptTokens: 30, completionTokens: 4, totalTokens: 34 },
      });
      setGenerationEndAttributes(span, TANSTACK_AI_DECIDE, { arguments: [callOptions], error }, {});

      expect(spanToStaticSpanJSON(span).data).toMatchObject({
        'gen_ai.response.model': 'gpt-6-luna-2026-09-01',
        'gen_ai.usage.input_tokens': 30,
        'gen_ai.usage.output_tokens': 4,
      });
    });
  });
});
