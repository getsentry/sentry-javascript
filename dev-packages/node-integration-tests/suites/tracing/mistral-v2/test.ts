import {
  GEN_AI_OPERATION_NAME,
  GEN_AI_RESPONSE_ID,
  GEN_AI_RESPONSE_STREAMING,
  GEN_AI_USAGE_TOTAL_TOKENS,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmTests } from '../../../utils/runner';

const ORIGIN = 'auto.ai.mistralai';
const MISTRAL_V2 = { additionalDependencies: { '@mistralai/mistralai': '2.6.4' } };

// The `mistral` suite runs on the latest major; this keeps the still-supported v2 covered. The
// scenarios are shared, since the request and response shapes we read are the same across majors.
describe('Mistral integration (v2)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmTests(
    __dirname,
    '../mistral/scenario-chat.mjs',
    '../mistral/instrument.mjs',
    (createRunner, test) => {
      test('creates chat and streamed chat spans on @mistralai/mistralai v2', async () => {
        await createRunner()
          .expect({
            span: container => {
              const chatSpan = container.items.find(
                s => s.attributes[GEN_AI_RESPONSE_ID]?.value === 'chatcmpl-mock123',
              );
              expect(chatSpan).toBeDefined();
              expect(chatSpan!.attributes[GEN_AI_OPERATION_NAME]?.value).toBe('chat');
              expect(chatSpan!.attributes[SENTRY_ORIGIN]?.value).toBe(ORIGIN);
              expect(chatSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]?.value).toBe(25);

              const streamSpan = container.items.find(
                s => s.attributes[GEN_AI_RESPONSE_ID]?.value === 'chatcmpl-stream-123',
              );
              expect(streamSpan).toBeDefined();
              expect(streamSpan!.attributes[GEN_AI_RESPONSE_STREAMING]?.value).toBe(true);
              expect(streamSpan!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]?.value).toBe(30);
            },
          })
          .start()
          .completed();
      });
    },
    MISTRAL_V2,
  );

  createEsmTests(
    __dirname,
    '../mistral/scenario-embeddings.mjs',
    '../mistral/instrument.mjs',
    (createRunner, test) => {
      test('creates embeddings spans on @mistralai/mistralai v2', async () => {
        await createRunner()
          .expect({
            span: container => {
              const embeddingsSpan = container.items.find(
                s => s.attributes[GEN_AI_OPERATION_NAME]?.value === 'embeddings',
              );
              expect(embeddingsSpan).toBeDefined();
              expect(embeddingsSpan!.attributes[SENTRY_ORIGIN]?.value).toBe(ORIGIN);
            },
          })
          .start()
          .completed();
      });
    },
    MISTRAL_V2,
  );
});
