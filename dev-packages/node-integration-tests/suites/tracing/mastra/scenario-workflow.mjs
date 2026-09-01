import * as Sentry from '@sentry/node';
import { z } from 'zod';
import { Mastra } from '@mastra/core';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { Observability } from '@mastra/observability';
import { SentryMastraExporter } from '@sentry/node';

// `workflow_run` maps to `gen_ai.invoke_agent`; `workflow_step` has no conventional op and is dropped.
const double = createStep({
  id: 'double',
  inputSchema: z.object({ n: z.number() }),
  outputSchema: z.object({ n: z.number() }),
  execute: async ({ inputData }) => ({ n: inputData.n * 2 }),
});

const workflow = createWorkflow({
  id: 'math_workflow',
  inputSchema: z.object({ n: z.number() }),
  outputSchema: z.object({ n: z.number() }),
})
  .then(double)
  .commit();

async function run() {
  const mastra = new Mastra({
    workflows: { math_workflow: workflow },
    logger: false,
    observability: new Observability({
      configs: {
        default: {
          serviceName: 'mastra-test',
          exporters: [new SentryMastraExporter()],
        },
      },
    }),
  });

  await Sentry.startSpan({ op: 'function', name: 'mastra-test' }, async () => {
    const workflowRun = await mastra.getWorkflow('math_workflow').createRun();
    await workflowRun.start({ inputData: { n: 21 } });
  });

  await mastra.observability.shutdown();
  await Sentry.flush(2000);
}

run();
