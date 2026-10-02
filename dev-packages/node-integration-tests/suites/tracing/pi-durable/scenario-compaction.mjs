import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { createModels } from '@earendil-works/pi-ai/models';
import { fauxAssistantMessage, fauxProvider } from '@earendil-works/pi-ai/providers/faux';
import { createRegistry, Harness, MemoryStorage } from '@earendil-works/pi-durable';

const context = BACKGROUND_CONTEXT;

// A context window so small that pi-durable compacts the conversation before it can answer the
// third question. The compaction request belongs to that run.
const faux = fauxProvider({ provider: 'faux', models: [{ id: 'tiny', contextWindow: 60 }] });
const models = createModels();
models.setProvider(faux.provider);
faux.setResponses([
  fauxAssistantMessage('First answer with quite a lot of detail so the transcript grows beyond the window.'),
  fauxAssistantMessage('Second answer with even more detail so that the next request needs a compaction first.'),
  fauxAssistantMessage('Summary of the conversation.'),
  fauxAssistantMessage('Third answer.'),
]);

const harness = await Harness.open(
  new MemoryStorage(),
  {
    models,
    registry: createRegistry(),
    settings: { compaction: { enabled: true, reserveTokens: 0, backgroundTokens: 0, keepRecentTokens: 1 } },
  },
  context,
);
const root = await harness.root(context, { agent: { model: { provider: 'faux', modelId: 'tiny' } } });
for (const content of [
  'First question with some words in it.',
  'Second question with some more words.',
  'Third question.',
]) {
  await (await root.submit({ type: 'input', content }, context)).wait(context);
}
await harness.waitForIdle(context);
await harness.close(context);
