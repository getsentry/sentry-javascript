import * as Sentry from '@sentry/node';
import { __flueBindAgentModule, init, instrument, useModel, useTool } from '@flue/runtime';
import { start } from '@flue/runtime/node';
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';

// `pi-ai`'s faux provider scripts model responses in-process, so the run is deterministic and needs
// no provider key or mock server. Two steps: a tool call, then the final answer.
instrument(Sentry.createFlueInstrumentation());

const faux = fauxProvider({
  provider: 'faux',
  models: [{ id: 'faux-model', cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 } }],
});
faux.setResponses([
  fauxAssistantMessage(fauxToolCall('get_weather', { city: 'Berlin' }, { id: 'call_1' }), { stopReason: 'toolUse' }),
  fauxAssistantMessage('It is 21 degrees and sunny in Berlin.'),
]);

function Hello() {
  useModel('faux/faux-model');
  useTool({
    name: 'get_weather',
    description: 'Get the current weather for a city.',
    run: ({ city }) => `It is 21 degrees and sunny in ${city}.`,
  });
  return 'You are a helpful assistant.';
}
__flueBindAgentModule(Hello, { identity: 'Hello' });

await Sentry.startSpan({ name: 'flue-test', op: 'function' }, async () => {
  const flue = await start({ agents: [Hello], providers: [faux.provider] });
  const agent = init(Hello, { id: 'e2e' });
  const receipt = await agent.dispatch('What is the weather in Berlin?');
  await agent.read(receipt);
  await flue[Symbol.asyncDispose]?.();
});

await Sentry.flush(2000);
