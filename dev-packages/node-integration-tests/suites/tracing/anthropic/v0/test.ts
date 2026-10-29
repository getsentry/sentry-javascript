import type { SerializedStreamedSpanContainer } from '@sentry/core';
import {
  GEN_AI_REQUEST_MODEL,
  GEN_AI_RESPONSE_ID,
  GEN_AI_RESPONSE_STREAMING,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';

type SerializedSpan = SerializedStreamedSpanContainer['items'][number];

const MESSAGE_CALLS = [
  { id: 'msg_v0_create', streaming: false },
  { id: 'msg_v0_beta_create', streaming: false },
  { id: 'msg_v0_stream', streaming: true },
  { id: 'msg_v0_stream_helper', streaming: true },
];

// The main suite runs on 1.x. This keeps the last 0.x version covered, including `completions`,
// which 1.0 removed.
describe('Anthropic integration (0.x)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('emits one span per call', async () => {
        await createRunner()
          .expect({
            span: container => {
              const spans = container.items.filter(
                span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.anthropic',
              );
              expect(spans).toHaveLength(6);
              for (const span of spans) {
                expect(span.attributes[SENTRY_OP]?.value, span.name).toBe('gen_ai.chat');
                expect(span.status, span.name).toBe('ok');
              }

              const spanForId = (id: string): SerializedSpan[] =>
                spans.filter(span => span.attributes[GEN_AI_RESPONSE_ID]?.value === id);

              for (const { id, streaming } of MESSAGE_CALLS) {
                expect(spanForId(id), id).toHaveLength(1);
                expect(spanForId(id)[0]!.attributes[GEN_AI_RESPONSE_STREAMING]?.value ?? false, id).toBe(streaming);
              }

              // `.asResponse()` hands back the raw response, so its span has no response id.
              const completionSpans = spans.filter(span => span.attributes[GEN_AI_REQUEST_MODEL]?.value === 'claude-2');
              expect(completionSpans.map(span => span.attributes[GEN_AI_RESPONSE_ID]?.value)).toEqual([
                'compl_v0',
                undefined,
              ]);
            },
          })
          .start()
          .completed();
      });
    },
    { additionalDependencies: { '@anthropic-ai/sdk': '0.133.0' } },
  );
});
