import * as Sentry from '@sentry/node';
import { __flueBindAgentModule, init, instrument, useModel } from '@flue/runtime';
import { start } from '@flue/runtime/node';
import { fauxAssistantMessage, fauxProvider } from '@earendil-works/pi-ai/providers/faux';

instrument(Sentry.createFlueInstrumentation());

const faux = fauxProvider({
  provider: 'faux',
  models: [{ id: 'faux-model', cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 } }],
});
faux.setResponses([fauxAssistantMessage('Hello, a.'), fauxAssistantMessage('Hello, b.')]);

function Hello() {
  useModel('faux/faux-model');
  return 'You are a helpful assistant.';
}
__flueBindAgentModule(Hello, { identity: 'Hello' });

const flue = await start({ agents: [Hello], providers: [faux.provider] });

// Each request gets its own isolation scope and trace, as the http integration gives a real one. The
// first dispatch starts Flue's claim loop, which keeps request-a's context for every later run.
for (const name of ['request-a', 'request-b']) {
  await Sentry.withIsolationScope(() =>
    Sentry.startNewTrace(() =>
      Sentry.startSpan({ name, op: 'http.server' }, async () => {
        const agent = init(Hello, { id: name });
        const receipt = await agent.dispatch('Say hello.');
        await agent.read(receipt);
      }),
    ),
  );
}

await flue[Symbol.asyncDispose]?.();
await Sentry.flush(2000);
