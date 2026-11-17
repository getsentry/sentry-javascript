import * as Sentry from '@sentry/node';
import { createModels } from '@earendil-works/pi-ai/models';
import { fauxAssistantMessage, fauxProvider } from '@earendil-works/pi-ai/providers/faux';

const faux = fauxProvider({ provider: 'faux', models: [{ id: 'faux-model' }] });
const models = createModels();
models.setProvider(faux.provider);
faux.setResponses([fauxAssistantMessage('Paris.'), fauxAssistantMessage('Paris.'), fauxAssistantMessage('Paris.')]);

const ask = content => ({ messages: [{ role: 'user', content, timestamp: Date.now() }] });

await Sentry.startSpan({ name: 'pi-ai-test' }, async () => {
  const model = faux.getModel();

  await Sentry.withScope(async scope => {
    scope.setTag('privacy', 'public');
    await models.complete(model, ask('public'));
  });

  await Sentry.withScope(async scope => {
    scope.setTag('privacy', 'private');
    await models.complete(model, ask('private'));

    // Changing the tag after the request started must not change its outputs decision.
    const events = models.stream(model, ask('public'));
    Sentry.getCurrentScope().setTag('privacy', 'public');
    for await (const _event of events) {
      // Drained like an app consuming the stream.
    }
  });
});
