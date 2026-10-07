import * as Sentry from '@sentry/node';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { Type } from '@earendil-works/pi-ai';
import { createModels } from '@earendil-works/pi-ai/models';
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
import { createRegistry, defineExtension, defineTool, Harness, MemoryStorage } from '@earendil-works/pi-durable';

const context = BACKGROUND_CONTEXT;
const RUNS = 3;

// Three runs that each call `spawn`, which creates a conversation it owns and returns without running
// it. The links to those conversations stay until the Harness closes; the traces must not.
const toolSpans = [];
Sentry.getClient().on('spanStart', span => {
  if (Sentry.spanToJSON(span).name === 'execute_tool spawn') {
    toolSpans.push(new WeakRef(span));
  }
});

const faux = fauxProvider({ provider: 'faux', models: [{ id: 'faux-model' }] });
const models = createModels();
models.setProvider(faux.provider);
faux.setResponses(
  Array.from(
    { length: RUNS * 2 },
    () => transcript =>
      transcript.messages.at(-1).role === 'toolResult'
        ? fauxAssistantMessage('The subagent is ready.')
        : fauxAssistantMessage(fauxToolCall('spawn', {}, { id: 'call_spawn' }), { stopReason: 'toolUse' }),
  ),
);

const registry = createRegistry();
registry.install(
  defineExtension({
    name: 'app',
    tools: [
      defineTool({
        name: 'spawn',
        description: 'Creates a subagent for later.',
        parameters: Type.Object({}),
        execute: async (_args, api, toolContext) => {
          await api.commit(
            tx => tx.createConversation({ ownership: { kind: 'task', taskId: api.taskId } }),
            toolContext,
          );
          return { content: [{ type: 'text', text: 'Subagent created.' }] };
        },
      }),
    ],
  }),
);

const harness = await Harness.open(new MemoryStorage(), { models, registry }, context);
const root = await harness.root(context, { agent: { model: { provider: 'faux', modelId: 'faux-model' } } });
for (let run = 1; run <= RUNS; run++) {
  await (await root.submit({ type: 'input', content: `Run ${run}` }, context)).wait(context);
}
await harness.waitForIdle(context);

// Sends the finished traces, which span streaming buffers until then.
await Sentry.flush();
// A WeakRef is never cleared in the job that created it.
await new Promise(resolve => setImmediate(resolve));
setFlagsFromString('--expose-gc');
const gc = runInNewContext('gc');
setFlagsFromString('--no-expose-gc');
gc();
gc();

Sentry.captureMessage('pi-durable retention', {
  extra: { toolCalls: toolSpans.length, alive: toolSpans.filter(ref => ref.deref()).length },
});
await harness.close(context);
