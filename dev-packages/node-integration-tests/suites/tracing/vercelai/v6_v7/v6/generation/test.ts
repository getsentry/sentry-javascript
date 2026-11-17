import { afterAll, expect, describe } from 'vitest';
import { SENTRY_OP } from '@sentry/conventions/attributes';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../../../utils/runner';
import { registerVercelAiGenerationTests } from '../../suite';
import { join } from 'node:path';

describe('Vercel AI integration (version 6)', () => {
  registerVercelAiGenerationTests('6', '^6.0.0');
});

describe('Vercel AI telemetry metadata (v6)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(
    join(__dirname, '../..'),
    'scenario-telemetry-metadata.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('records experimental_telemetry.metadata as span attributes', async () => {
        await createRunner()
          .expect({
            span: container => {
              for (const [name, op, requestId] of [
                ['invoke_agent support-chat', 'gen_ai.invoke_agent', 'req_generate'],
                ['generate_content mock-model-id', 'gen_ai.generate_content', 'req_generate'],
                ['invoke_agent support-stream', 'gen_ai.invoke_agent', 'req_stream'],
                ['generate_content mock-model-id', 'gen_ai.generate_content', 'req_stream'],
                ['embeddings mock-model-id', 'gen_ai.embeddings', 'req_embed'],
                ['embeddings mock-model-id', 'gen_ai.embeddings', 'req_embed_many'],
              ]) {
                const span = container.items.find(
                  span =>
                    span.name === name &&
                    span.attributes['vercel.ai.telemetry.metadata.requestId']?.value === requestId,
                );
                expect(span?.attributes[SENTRY_OP]).toEqual({ type: 'string', value: op });
                expect(span?.attributes['vercel.ai.telemetry.metadata.tenantId']).toEqual({
                  type: 'string',
                  value: 'acme',
                });
              }
              const generateSpans = container.items.filter(
                span => span.attributes['vercel.ai.telemetry.metadata.requestId']?.value === 'req_generate',
              );
              for (const span of generateSpans) {
                expect(span.attributes['vercel.ai.telemetry.metadata.attempt']).toEqual({ type: 'string', value: '2' });
              }
            },
          })
          .start()
          .completed();
      });
    },
    { additionalDependencies: { ai: '^6.0.0' } },
  );
});
