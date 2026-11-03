import { GEN_AI_RESPONSE_ID, GEN_AI_RESPONSE_STREAMING } from '@sentry/conventions/attributes';
import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';
import { getSpanOp, getSpansFromEnvelope } from '../../../spanUtils';

// The stream helpers of the `@anthropic-ai/sdk` tag their internal `create` with a helper header, and
// the integration skips that create only while one of its own `messages.stream()` spans is active.
// This runs that check on workerd, where the active span is the core span rather than an
// OpenTelemetry one, through the Vite plugin's build-time instrumentation.

it('emits one span for messages.stream(), not a second one for its internal create', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .ignore('event')
    .expect(envelope => {
      const spans = getSpansFromEnvelope(envelope);
      const genAiSpans = spans.filter(span => getSpanOp(span)?.startsWith('gen_ai.'));

      expect(genAiSpans).toHaveLength(1);
      expect(genAiSpans[0]!.attributes[GEN_AI_RESPONSE_ID]).toEqual({ value: 'msg_stream', type: 'string' });
      expect(genAiSpans[0]!.attributes[GEN_AI_RESPONSE_STREAMING]).toEqual({ value: true, type: 'boolean' });
    })
    .start(signal);
  await runner.makeRequest('get', '/stream');
  await runner.completed();
});

it('emits one span for beta.messages.stream(), whose internal create is the only span', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .ignore('event')
    .expect(envelope => {
      const spans = getSpansFromEnvelope(envelope);
      const genAiSpans = spans.filter(span => getSpanOp(span)?.startsWith('gen_ai.'));

      expect(genAiSpans).toHaveLength(1);
      expect(genAiSpans[0]!.attributes[GEN_AI_RESPONSE_ID]).toEqual({ value: 'msg_beta_stream', type: 'string' });
    })
    .start(signal);
  await runner.makeRequest('get', '/beta-stream');
  await runner.completed();
});
