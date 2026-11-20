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
    ['../mistral/scenario-chat.mjs', '../mistral/scenario-embeddings.mjs'],
    '../mistral/instrument.mjs',
    (createRunner, test) => {
      let scenarios: ReturnType<typeof runScenarios> | undefined;
      async function runScenarios() {
        const runner = createRunner();

        const collectors = ['../mistral/scenario-chat.mjs', '../mistral/scenario-embeddings.mjs'].map(name =>
          runner.collectStreamedSpansUntilSegment(
            span => span.name === 'main' && span.attributes['test.scenario']?.value === name,
          ),
        );
        await runner.start().completed();
        return { spans: await Promise.all(collectors) };
      }
      const getScenarios = () => (scenarios ??= runScenarios());

      test('creates chat and streamed chat spans on @mistralai/mistralai v2', async () => {
        {
          const container = { items: (await getScenarios()).spans[0]! };

          const chatSpan = container.items.find(s => s.attributes[GEN_AI_RESPONSE_ID]?.value === 'chatcmpl-mock123');
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
        }
      });

      test('creates embeddings spans on @mistralai/mistralai v2', async () => {
        {
          const container = { items: (await getScenarios()).spans[1]! };

          const embeddingsSpan = container.items.find(s => s.attributes[GEN_AI_OPERATION_NAME]?.value === 'embeddings');
          expect(embeddingsSpan).toBeDefined();
          expect(embeddingsSpan!.attributes[SENTRY_ORIGIN]?.value).toBe(ORIGIN);
        }
      });
    },
    MISTRAL_V2,
  );
});
