import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { createModels } from '@earendil-works/pi-ai/models';
import { fauxAssistantMessage, fauxProvider } from '@earendil-works/pi-ai/providers/faux';
import {
  createRegistry,
  defineExtension,
  defineTask,
  GenerationTask,
  Harness,
  hook,
  MemoryStorage,
} from '@earendil-works/pi-durable';

const context = BACKGROUND_CONTEXT;

// Failures pi-durable does not propagate: a hook that throws (pi-durable reports it and keeps the
// run going) and a durable task whose phase throws (the scheduler faults the task). A compaction
// started while the conversation is idle runs outside any run.
const faux = fauxProvider({ provider: 'faux', models: [{ id: 'faux-model' }] });
const models = createModels();
models.setProvider(faux.provider);
faux.setResponses([
  fauxAssistantMessage('First answer with some detail.'),
  fauxAssistantMessage('Second answer with more detail.'),
  fauxAssistantMessage('Summary of the conversation.'),
]);

const Charge = defineTask({
  name: 'app.charge',
  version: 1,
  initial: () => ({ phase: 'charge' }),
  phases: {
    charge: async () => {
      throw new Error('card declined');
    },
  },
  abort: async (_task, runtime, taskContext) => {
    await runtime.commit(() => ({ status: 'terminal', outcome: { status: 'aborted' } }), taskContext);
  },
});

const registry = createRegistry();
registry.install(
  defineExtension({
    name: 'app',
    tasks: [Charge],
    hooks: [
      hook(GenerationTask, {
        afterResponse: () => {
          throw new Error('afterResponse hook failed');
        },
      }),
    ],
  }),
);

const harness = await Harness.open(
  new MemoryStorage(),
  { models, registry, settings: { compaction: { keepRecentTokens: 1 } } },
  context,
);
const root = await harness.root(context, { agent: { model: { provider: 'faux', modelId: 'faux-model' } } });
await (await root.submit({ type: 'input', content: 'First question.' }, context)).wait(context);
await (await root.submit({ type: 'input', content: 'Second question.' }, context)).wait(context);

const charge = await root.commit(tx => tx.createTask(Charge, {}, { ownership: { kind: 'conversation' } }), context);
await harness.waitForTask(charge, context);

await harness.waitForTask(await root.compact(undefined, context), context);
await harness.close(context);
