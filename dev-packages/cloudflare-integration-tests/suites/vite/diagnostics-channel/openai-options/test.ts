import { GEN_AI_INPUT_MESSAGES, GEN_AI_RESPONSE_TEXT, SENTRY_OP, SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import { GEN_AI_CHAT } from '@sentry/conventions/op';
import { expect, it } from 'vitest';
import { createRunner } from '../../../../runner';

it('applies the options of an openAIIntegration the user configured', async ({ signal }) => {
  const runner = createRunner(__dirname).ignore('event').start(signal);

  // The segment span and the gen_ai child. The segment can arrive before the child's envelope.
  const spansPromise = runner.collectStreamedSpans(spansOfTrace => spansOfTrace.length === 2);

  await runner.makeRequest('get', '/');

  const genAiSpans = (await spansPromise).filter(span => !span.is_segment);
  expect(genAiSpans).toHaveLength(1);
  const attributes = genAiSpans[0]?.attributes;

  // The vite plugin instrumented `openai`, so the channel integration created the span.
  expect(attributes?.[SENTRY_OP]).toEqual({ type: 'string', value: GEN_AI_CHAT });
  expect(attributes?.[SENTRY_ORIGIN]).toEqual({ type: 'string', value: 'auto.ai.openai' });
  // `recordInputs: false` from the configured integration wins over `dataCollection`, which records
  // inputs by default. Outputs keep the default.
  expect(attributes?.[GEN_AI_INPUT_MESSAGES]).toBeUndefined();
  expect(attributes?.[GEN_AI_RESPONSE_TEXT]).toEqual({ type: 'string', value: '["Hello from OpenAI!"]' });
});
