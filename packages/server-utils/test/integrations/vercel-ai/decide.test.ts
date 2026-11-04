import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GEN_AI_OUTPUT_MESSAGES } from '@sentry/conventions/attributes';
import { GEN_AI_DECIDE } from '@sentry/conventions/op';
import { getMainCarrier, setCurrentClient, spanToStaticSpanJSON } from '@sentry/core';
import type { Span } from '@sentry/core';
import { createSpanFromMessage, enrichSpanOnEnd } from '../../../src/integrations/vercel-ai/vercel-ai-dc-subscriber';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

type Message = Parameters<typeof createSpanFromMessage>[0];

describe('Vercel AI decide spans', () => {
  let endedSpans: Span[];

  beforeEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
    const client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
        tracesSampleRate: 1,
      }),
    );
    setCurrentClient(client);
    client.init();
    endedSpans = [];
    client.on('spanEnd', span => endedSpans.push(span));
  });

  afterEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
  });

  function recordedAnswers(provider: string, result: Message['result']): unknown {
    const message = {
      type: 'experimental_decide',
      event: {
        provider,
        modelId: 'typesafe/jev-1.13',
        state: 'I was charged twice and the app keeps crashing',
        questions: {},
        recordInputs: true,
        recordOutputs: true,
      },
      result,
    } satisfies Message;

    const span = createSpanFromMessage(message, {} as Parameters<typeof createSpanFromMessage>[1])!;
    enrichSpanOnEnd(span, message, {} as Parameters<typeof enrichSpanOnEnd>[2]);
    span.end();

    return JSON.parse(spanToStaticSpanJSON(endedSpans[0]!).data?.[GEN_AI_OUTPUT_MESSAGES] as string)[0].answers;
  }

  // `ai` 7.0.128 renamed the channel event from `experimental_evaluate` to `experimental_decide`.
  it.each(['experimental_evaluate', 'experimental_decide'] as const)('creates a decide span for `%s`', type => {
    const message = {
      type,
      event: {
        provider: 'gateway',
        modelId: 'typesafe-ai/jev',
        state: 'I want a refund',
        questions: { wantsRefund: { type: 'boolean', instructions: 'Is a refund requested?' } },
        recordInputs: true,
        recordOutputs: true,
      },
      result: { answers: { wantsRefund: { type: 'boolean', probability: 0.99 } } },
    } satisfies Message;

    const span = createSpanFromMessage(message, {} as Parameters<typeof createSpanFromMessage>[1])!;
    expect(span).toBeDefined();
    enrichSpanOnEnd(span, message, {} as Parameters<typeof enrichSpanOnEnd>[2]);
    span.end();

    const json = spanToStaticSpanJSON(endedSpans[0]!);
    expect(json.description).toBe('decide typesafe-ai/jev');
    expect(json.op).toBe(GEN_AI_DECIDE);
    expect(JSON.parse(json.data?.[GEN_AI_OUTPUT_MESSAGES] as string)).toEqual([
      { type: 'evaluation', answers: { wantsRefund: { type: 'boolean', probability: 0.99 } } },
    ]);
  });

  it.each(['typesafe', 'openai'])('restores answer confidence from `providerMetadata.%s`', provider => {
    const answers = recordedAnswers(provider, {
      answers: { department: { type: 'choice', choice: 'billing' } },
      providerMetadata: { [provider]: { confidence: { department: 0.91 } } },
    });

    expect(answers).toEqual({ department: { type: 'choice', choice: 'billing', confidence: 0.91 } });
  });

  describe('OpenRouter evaluation models', () => {
    it('restores choice confidence from `providerMetadata.openrouter.answers`', () => {
      const answers = recordedAnswers('openrouter', {
        answers: {
          department: { type: 'choice', choice: 'billing', probabilities: { billing: 0.82, technical: 0.18 } },
          wantsRefund: { type: 'boolean', probability: 0.97 },
        },
        providerMetadata: {
          openrouter: { provider: 'TypeSafe', answers: { department: { confidence: 0.64 }, wantsRefund: {} } },
        },
      });

      expect(answers).toEqual({
        department: {
          type: 'choice',
          choice: 'billing',
          probabilities: { billing: 0.82, technical: 0.18 },
          confidence: 0.64,
        },
        wantsRefund: { type: 'boolean', probability: 0.97 },
      });
    });

    it('restores score confidence and legend from `providerMetadata.openrouter.answers`', () => {
      const legend = { '0': 'Not urgent', '1': 'Handle today', '2': 'Page on-call' };

      const answers = recordedAnswers('openrouter', {
        answers: { urgency: { type: 'score', score: 1.8, probabilities: { '0': 0, '1': 0.2, '2': 0.8 } } },
        providerMetadata: { openrouter: { answers: { urgency: { confidence: 0.31, legend } } } },
      });

      expect(answers).toEqual({
        urgency: {
          type: 'score',
          score: 1.8,
          probabilities: { '0': 0, '1': 0.2, '2': 0.8 },
          confidence: 0.31,
          legend,
        },
      });
    });

    it.each([
      ['no provider metadata', undefined],
      ['no `answers` entry', { openrouter: { provider: 'TypeSafe', usage: { cost: 0.0004 } } }],
      ['no entry for the question', { openrouter: { answers: { department: { confidence: 0.64 } } } }],
    ])('leaves answers unchanged with %s', (_, providerMetadata) => {
      const answers = recordedAnswers('openrouter', {
        answers: { urgency: { type: 'score', score: 1.8 } },
        providerMetadata,
      });

      expect(answers).toEqual({ urgency: { type: 'score', score: 1.8 } });
    });

    it('keeps confidence and legend already on the answer', () => {
      const answers = recordedAnswers('openrouter', {
        answers: { urgency: { type: 'score', score: 1.8, confidence: 0.9, legend: { '2': 'Page on-call' } } },
        providerMetadata: {
          openrouter: { answers: { urgency: { confidence: 0.31, legend: { '2': 'Escalate' } } } },
        },
      });

      expect(answers).toEqual({
        urgency: { type: 'score', score: 1.8, confidence: 0.9, legend: { '2': 'Page on-call' } },
      });
    });
  });
});
