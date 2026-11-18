import * as Sentry from '@sentry/node';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { Type } from '@earendil-works/pi-ai';
import { createModels } from '@earendil-works/pi-ai/models';
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
import { createRegistry, defineExtension, defineTool, Harness, MemoryStorage } from '@earendil-works/pi-durable';

const context = BACKGROUND_CONTEXT;

globalThis.recordOutputs = true;
const respond = transcript => {
  globalThis.recordOutputs = false;
  return transcript.messages.some(message => message.role === 'toolResult')
    ? fauxAssistantMessage('It is sunny in Berlin.')
    : fauxAssistantMessage(fauxToolCall('get_weather', { city: 'Berlin' }, { id: 'call_1' }), {
        stopReason: 'toolUse',
      });
};
const faux = fauxProvider({ provider: 'faux', models: [{ id: 'faux-model' }] });
const models = createModels();
models.setProvider(faux.provider);
faux.setResponses([respond, respond]);

const registry = createRegistry();
registry.install(
  defineExtension({
    name: 'app',
    tools: [
      defineTool({
        name: 'get_weather',
        description: 'Get the current weather for a city.',
        parameters: Type.Object({ city: Type.String() }),
        execute: async ({ city }) => ({ output: [{ type: 'text', text: `It is sunny in ${city}.` }] }),
      }),
    ],
  }),
);

const harness = await Harness.open(new MemoryStorage(), { models, registry }, context);
const agent = { model: { provider: 'faux', modelId: 'faux-model' } };
const conversation = await harness.createConversation({ ownership: { kind: 'ownerless' }, agent }, context);
await (await conversation.submit({ type: 'input', content: 'What is the weather in Berlin?' }, context)).wait(context);
await harness.close(context);

await Sentry.flush(2000);
