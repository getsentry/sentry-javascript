import * as Sentry from '@sentry/node';
import { Type } from '@earendil-works/pi-ai';
import { complete, registerFauxProvider, streamSimple } from '@earendil-works/pi-ai/compat';
import { createModels } from '@earendil-works/pi-ai/models';
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';

// `pi-ai`'s faux providers script model responses in-process: one for a `Models` collection, one
// registered with the standalone `compat` functions.
const faux = fauxProvider({ provider: 'faux', models: [{ id: 'faux-model' }] });
const models = createModels();
models.setProvider(faux.provider);
faux.setResponses([
  fauxAssistantMessage(fauxToolCall('get_weather', { city: 'Berlin' }, { id: 'call_1' }), { stopReason: 'toolUse' }),
  fauxAssistantMessage('It is sunny in Berlin.'),
]);

const compat = registerFauxProvider({ provider: 'compat-faux', models: [{ id: 'compat-model' }] });
compat.setResponses([fauxAssistantMessage('Hello.'), fauxAssistantMessage('Goodbye.')]);

const tools = [
  {
    name: 'get_weather',
    description: 'Get the current weather for a city.',
    parameters: Type.Object({ city: Type.String() }),
  },
];
const question = { role: 'user', content: 'What is the weather in Berlin?', timestamp: Date.now() };

await Sentry.startSpan({ name: 'pi-ai-test' }, async () => {
  const model = faux.getModel();
  const events = models.streamSimple(model, {
    systemPrompt: 'You are a weather assistant.',
    messages: [question],
    tools,
  });
  for await (const _event of events) {
    // Drained like an app consuming the stream.
  }
  const toolCall = await events.result();

  await models.complete(model, {
    systemPrompt: 'You are a weather assistant.',
    messages: [
      question,
      toolCall,
      {
        role: 'toolResult',
        toolCallId: 'call_1',
        toolName: 'get_weather',
        content: [{ type: 'text', text: 'sunny' }],
        isError: false,
        timestamp: Date.now(),
      },
    ],
    tools,
  });

  const compatModel = compat.getModel();
  await complete(compatModel, { messages: [{ role: 'user', content: 'Hi.', timestamp: Date.now() }] });
  await streamSimple(compatModel, { messages: [{ role: 'user', content: 'Bye.', timestamp: Date.now() }] }).result();
});
