import {
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OUTPUT_MESSAGES,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { GEN_AI_CHAT, GEN_AI_INVOKE_AGENT } from '@sentry/conventions/op';
import { afterAll, expect, describe } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../../utils/runner';
import { supports } from '../../../../../utils';
import { join } from 'node:path';
import { MASTRA_DEPENDENCIES } from '../../dependencies';

describe.runIf(supports({ min: 22 }))('Mastra integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });
  createEsmAndCjsTests(
    join(__dirname, '../..'),
    'scenario-auto.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('auto-instruments a Mastra app that configured no observability at all', async () => {
        await createRunner()
          .expect({
            span: container => {
              expect(container.items.find(span => span.is_segment && span.name === 'mastra-test')).toBeDefined();
              const spans = container.items.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.mastra');
              expect(spans.map(span => span.name).sort()).toEqual(['chat gpt-4o-mini', 'invoke_agent weather_agent']);
              for (const span of spans) {
                expect(span.attributes[SENTRY_ORIGIN].value).toBe('auto.ai.mastra');
              }
            },
          })
          .start()
          .completed();
      });
    },
    MASTRA_DEPENDENCIES,
  );
  createEsmAndCjsTests(
    join(__dirname, '../..'),
    'scenario-community-exporter.mjs',
    'instrument.mjs',
    (createRunner, test) => {
      test('still exports its own spans when the community @mastra/sentry exporter is present', async () => {
        await createRunner()
          .expect({
            span: container => {
              expect(container.items.find(span => span.is_segment && span.name === 'mastra-test')).toBeDefined();
              const spans = container.items.filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.mastra');
              expect(spans.map(span => span.name).sort()).toEqual(['chat gpt-4o-mini', 'invoke_agent weather_agent']);
            },
          })
          .start()
          .completed();
      });
    },
    MASTRA_DEPENDENCIES,
  );
  createEsmAndCjsTests(
    join(__dirname, '../..'),
    'scenario-auto.mjs',
    'instrument-no-bootstrap.mjs',
    (createRunner, test) => {
      test('leaves an unconfigured app alone when bootstrapObservability is false', async () => {
        await createRunner()
          .expect({
            span: container => {
              expect(container.items.find(span => span.is_segment && span.name === 'mastra-test')).toBeDefined();
              const genAiSpans = container.items.filter(span =>
                String(span.attributes[SENTRY_OP]?.value ?? '').startsWith('gen_ai.'),
              );
              expect(genAiSpans).toEqual([]);
            },
          })
          .start()
          .completed();
      });
    },
    MASTRA_DEPENDENCIES,
  );

  createEsmAndCjsTests(
    join(__dirname, '../..'),
    'scenario-auto.mjs',
    'instrument-with-recording-functions.mjs',
    (createRunner, test) => {
      test('decides content recording per span when the options are functions', async () => {
        await createRunner()
          .expect({
            span: container => {
              const recordedByOp = Object.fromEntries(
                container.items
                  .filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.mastra')
                  .map(span => [
                    span.attributes[SENTRY_OP]?.value,
                    {
                      inputs: GEN_AI_INPUT_MESSAGES in span.attributes,
                      outputs: GEN_AI_OUTPUT_MESSAGES in span.attributes,
                    },
                  ]),
              );
              expect(recordedByOp).toEqual({
                [GEN_AI_INVOKE_AGENT]: { inputs: true, outputs: true },
                [GEN_AI_CHAT]: { inputs: false, outputs: true },
              });
            },
          })
          .start()
          .completed();
      });
    },
    MASTRA_DEPENDENCIES,
  );

  createEsmAndCjsTests(
    join(__dirname, '../..'),
    'scenario-auto.mjs',
    'instrument-with-span-hooks.mjs',
    (createRunner, test) => {
      test('runs the span hooks with the Mastra span at start and the ended Mastra span at end', async () => {
        await createRunner()
          .expect({
            span: container => {
              const hooksByOp = Object.fromEntries(
                container.items
                  .filter(span => span.attributes[SENTRY_ORIGIN]?.value === 'auto.ai.mastra')
                  .map(span => [
                    span.attributes[SENTRY_OP]?.value,
                    [span.attributes['test.start']?.value, span.attributes['test.end']?.value],
                  ]),
              );
              expect(hooksByOp).toEqual({
                [GEN_AI_INVOKE_AGENT]: ['agent_run', true],
                [GEN_AI_CHAT]: ['model_generation', true],
              });
            },
          })
          .start()
          .completed();
      });
    },
    MASTRA_DEPENDENCIES,
  );
});
