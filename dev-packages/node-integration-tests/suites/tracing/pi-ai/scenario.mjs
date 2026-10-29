import * as Sentry from '@sentry/node';
import { Type } from '@earendil-works/pi-ai';
import { createModels } from '@earendil-works/pi-ai/models';
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';

// `pi-ai`'s faux provider scripts model responses in-process.
const faux = fauxProvider({ provider: 'faux', models: [{ id: 'faux-model' }] });
const models = createModels();
models.setProvider(faux.provider);
faux.setResponses([
  fauxAssistantMessage(fauxToolCall('get_weather', { city: 'Berlin' }, { id: 'call_1' }), { stopReason: 'toolUse' }),
  fauxAssistantMessage('It is sunny in Berlin.'),
]);

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
});
