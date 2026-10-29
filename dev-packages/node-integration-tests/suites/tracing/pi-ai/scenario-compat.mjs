import * as Sentry from '@sentry/node';
import { complete, fauxAssistantMessage, registerFauxProvider, streamSimple } from '@earendil-works/pi-ai/compat';

// The standalone API dispatches to the providers registered with it.
const compat = registerFauxProvider({ provider: 'compat-faux', models: [{ id: 'compat-model' }] });
compat.setResponses([fauxAssistantMessage('Hello.'), fauxAssistantMessage('Goodbye.')]);

await Sentry.startSpan({ name: 'pi-ai-test' }, async () => {
  const model = compat.getModel();
  await complete(model, { messages: [{ role: 'user', content: 'Hi.', timestamp: Date.now() }] });
  await streamSimple(model, { messages: [{ role: 'user', content: 'Bye.', timestamp: Date.now() }] }).result();
});
