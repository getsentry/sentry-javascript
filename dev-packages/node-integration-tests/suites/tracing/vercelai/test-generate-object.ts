import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('Vercel AI integration - generateObject', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario-generate-object.mjs', 'instrument.mjs', (createRunner, test) => {
    test('captures generateObject spans with schema attributes', async () => {
      await createRunner()
        .expect({ transaction: { transaction: 'main' } })
        .expect({
          span: container => {
            expect(container.items).toHaveLength(2);
            const [firstSpan, secondSpan] = container.items;

            // [0] generateObject (invoke_agent)
            expect(firstSpan!.name).toBe('invoke_agent');
            expect(firstSpan!.status).toBe('ok');
            expect(firstSpan!.attributes['sentry.op'].value).toBe('gen_ai.invoke_agent');
            expect(firstSpan!.attributes['vercel.ai.operationId'].value).toBe('ai.generateObject');
            expect(firstSpan!.attributes['sentry.origin'].value).toBe('auto.vercelai.otel');
            expect(firstSpan!.attributes['gen_ai.operation.name'].value).toBe('invoke_agent');
            expect(firstSpan!.attributes['gen_ai.response.model'].value).toBe('mock-model-id');
            expect(firstSpan!.attributes['gen_ai.usage.input_tokens'].value).toBe(15);
            expect(firstSpan!.attributes['gen_ai.usage.output_tokens'].value).toBe(25);
            expect(firstSpan!.attributes['gen_ai.usage.total_tokens'].value).toBe(40);
            expect(firstSpan!.attributes['gen_ai.request.schema']).toBeDefined();

            // [1] generateObject.doGenerate (generate_content)
            expect(secondSpan!.name).toBe('generate_content mock-model-id');
            expect(secondSpan!.status).toBe('ok');
            expect(secondSpan!.attributes['sentry.op'].value).toBe('gen_ai.generate_content');
            expect(secondSpan!.attributes['vercel.ai.operationId'].value).toBe('ai.generateObject.doGenerate');
            expect(secondSpan!.attributes['sentry.origin'].value).toBe('auto.vercelai.otel');
            expect(secondSpan!.attributes['gen_ai.operation.name'].value).toBe('generate_content');
            expect(secondSpan!.attributes['gen_ai.system'].value).toBe('mock-provider');
            expect(secondSpan!.attributes['gen_ai.request.model'].value).toBe('mock-model-id');
            expect(secondSpan!.attributes['gen_ai.response.model'].value).toBe('mock-model-id');
            expect(secondSpan!.attributes['gen_ai.usage.input_tokens'].value).toBe(15);
            expect(secondSpan!.attributes['gen_ai.usage.output_tokens'].value).toBe(25);
            expect(secondSpan!.attributes['gen_ai.usage.total_tokens'].value).toBe(40);
          },
        })
        .start()
        .completed();
    });
  });
});
