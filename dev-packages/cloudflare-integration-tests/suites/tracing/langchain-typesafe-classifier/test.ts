import {
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_RESPONSE_MODEL,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { GEN_AI_EVALUATE } from '@sentry/conventions/op';
import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';
import { getSpanOp, getSpansFromEnvelope } from '../../../spanUtils';

// The worker passes no callback handler, so the span only exists if the Vite plugin's build-time hook
// on `TypeSafeClassifier.invoke` adds it. The input `state` is the transcript the classifier sends to
// Jev, which only the hook records.

it('traces a TypeSafeClassifier call through the Vite plugin instrumentation', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .ignore('event')
    .expect(envelope => {
      const spans = getSpansFromEnvelope(envelope);
      const segmentSpan = spans.find(span => span.is_segment);
      const genAiSpans = spans.filter(span => getSpanOp(span)?.startsWith('gen_ai.'));

      expect(genAiSpans).toHaveLength(1);

      const evaluateSpan = genAiSpans[0]!;
      expect(evaluateSpan.name).toBe('evaluate jev-latest');
      expect(evaluateSpan.parent_span_id).toBe(segmentSpan?.span_id);
      expect(evaluateSpan.status).toBe('ok');
      expect(evaluateSpan.attributes).toMatchObject({
        [SENTRY_OP]: { value: GEN_AI_EVALUATE, type: 'string' },
        [SENTRY_ORIGIN]: { value: 'auto.ai.langchain', type: 'string' },
        [GEN_AI_OPERATION_NAME]: { value: 'evaluate', type: 'string' },
        [GEN_AI_PROVIDER_NAME]: { value: 'typesafe', type: 'string' },
        [GEN_AI_REQUEST_MODEL]: { value: 'jev-latest', type: 'string' },
        [GEN_AI_RESPONSE_MODEL]: { value: 'jev-1.13', type: 'string' },
        [GEN_AI_USAGE_INPUT_TOKENS]: { value: 30, type: 'integer' },
        [GEN_AI_USAGE_OUTPUT_TOKENS]: { value: 2, type: 'integer' },
      });
      expect(JSON.parse(evaluateSpan.attributes[GEN_AI_INPUT_MESSAGES]!.value as string)).toEqual([
        {
          type: 'evaluation',
          state: ['user: My payouts have been failing.'],
          questions: { urgent: { type: 'noul', instructions: 'Is this urgent?' } },
        },
      ]);
      expect(JSON.parse(evaluateSpan.attributes[GEN_AI_OUTPUT_MESSAGES]!.value as string)).toEqual([
        { type: 'evaluation', answers: { urgent: { type: 'noul', noul: 0.9 } } },
      ]);
    })
    .start(signal);
  await runner.makeRequest('get', '/');
  await runner.completed();
});
