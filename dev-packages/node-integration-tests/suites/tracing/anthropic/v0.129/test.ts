import type { SerializedStreamedSpanContainer } from '@sentry/core';
import { GEN_AI_RESPONSE_ID, GEN_AI_RESPONSE_STREAMING } from '@sentry/conventions/attributes';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';

// The attribute extraction is version-independent and covered by the suite pinned to 0.63. What a
// newer SDK puts at risk is how its internals are recognised: since 0.106 the `messages.stream()`
// helper tags its internal `create` call with a lowercase `x-stainless-helper-method` header (it
// was `X-Stainless-Helper-Method` up to 0.105), and the dedup of that call keyed on the exact casing.
describe('Anthropic integration (0.129)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(
    __dirname,
    'scenario-stream-helper.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('emits one span for messages.stream(), not a second one for its internal create', async () => {
        const allSpans: SerializedStreamedSpanContainer['items'] = [];

        await createRunner()
          .unordered()
          .expect({
            span: container => {
              allSpans.push(...container.items);
              const segment = allSpans.find(span => span.is_segment && span.name === 'main');
              expect(segment).toBeDefined();
              const streamingSpans = allSpans.filter(
                span => span.attributes[GEN_AI_RESPONSE_ID]?.value === 'msg_stream_1',
              );
              expect(streamingSpans).toHaveLength(1);
              expect(streamingSpans[0]!.attributes['sentry.op']).toEqual({ type: 'string', value: 'gen_ai.chat' });
              expect(streamingSpans[0]!.attributes[GEN_AI_RESPONSE_STREAMING]).toEqual({
                type: 'boolean',
                value: true,
              });
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        '@anthropic-ai/sdk': '0.129.0',
      },
    },
  );

  // These helpers send the same header, but no `messages-stream` span covers them. So their
  // internal `create` must still get a span.
  createEsmAndCjsTests(
    __dirname,
    'scenario-beta-stream-helpers.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('emits one span each for beta.messages.stream() and the eager streaming tool runner', async () => {
        const allSpans: SerializedStreamedSpanContainer['items'] = [];

        await createRunner()
          .unordered()
          .expect({
            span: container => {
              allSpans.push(...container.items);
              const segment = allSpans.find(span => span.is_segment && span.name === 'main');
              expect(segment).toBeDefined();
              for (const id of ['msg_beta_stream', 'msg_tool_runner_eager']) {
                const spans = allSpans.filter(span => span.attributes[GEN_AI_RESPONSE_ID]?.value === id);
                expect(spans, id).toHaveLength(1);
                expect(spans[0]!.attributes['sentry.op']).toEqual({ type: 'string', value: 'gen_ai.chat' });
              }
            },
          })
          .start()
          .completed();
      });
    },
    {
      additionalDependencies: {
        '@anthropic-ai/sdk': '0.129.0',
      },
    },
  );
});
