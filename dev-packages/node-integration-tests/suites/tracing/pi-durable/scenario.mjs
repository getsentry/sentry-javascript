import * as Sentry from '@sentry/node';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { Type } from '@earendil-works/pi-ai';
import { createModels } from '@earendil-works/pi-ai/models';
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
import {
  createRegistry,
  defineExtension,
  defineTool,
  Harness,
  MemoryStorage,
  section,
} from '@earendil-works/pi-durable';

const context = BACKGROUND_CONTEXT;

// `pi-ai`'s faux provider scripts model responses in-process. The first run calls two tools and then
// answers, the second run answers directly.
const faux = fauxProvider({ provider: 'faux', models: [{ id: 'faux-model' }] });
const models = createModels();
models.setProvider(faux.provider);
faux.setResponses([
  fauxAssistantMessage(
    [fauxToolCall('get_weather', { city: 'Berlin' }, { id: 'call_1' }), fauxToolCall('broken', {}, { id: 'call_2' })],
    { stopReason: 'toolUse' },
  ),
  fauxAssistantMessage('It is 21 degrees and sunny in Berlin.'),
  fauxAssistantMessage('Goodbye.'),
]);

const registry = createRegistry();
registry.install(
  defineExtension({
    name: 'weather',
    sections: [section('preamble', () => 'You are a weather assistant.', { tag: false })],
    tools: [
      defineTool({
        name: 'get_weather',
        description: 'Get the current weather for a city.',
        parameters: Type.Object({ city: Type.String() }),
        execute: async args => ({ content: [{ type: 'text', text: `It is 21 degrees and sunny in ${args.city}.` }] }),
      }),
      defineTool({
        name: 'broken',
        description: 'Always fails.',
        parameters: Type.Object({}),
        execute: async () => {
          throw new Error('broken tool');
        },
      }),
    ],
  }),
);

// The Harness is opened and driven inside a request span. Its runs must still start traces of their
// own: the scheduler runs them later, and their trace must not depend on which request woke it.
await Sentry.startSpan({ name: 'pi-durable-request', op: 'http.server' }, async () => {
  const harness = await Harness.open(new MemoryStorage(), { models, registry }, context);
  const root = await harness.root(context, { agent: { model: { provider: 'faux', modelId: 'faux-model' } } });
  await (await root.submit({ type: 'input', content: 'What is the weather in Berlin?' }, context)).wait(context);
  await (await root.submit({ type: 'input', content: 'Thanks!' }, context)).wait(context);
  await harness.close(context);
});
