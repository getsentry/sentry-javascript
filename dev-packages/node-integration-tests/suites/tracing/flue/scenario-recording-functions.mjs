import * as Sentry from '@sentry/node';
import { __flueBindAgentModule, init, instrument, useModel, useTool } from '@flue/runtime';
import { start } from '@flue/runtime/node';
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
import * as v from 'valibot';

const privacy = () => Sentry.getIsolationScope().getScopeData().tags.privacy;

// Flue runs an agent in the isolation scope of the request that dispatched it, so the tag set there
// reaches the functions. The pi-ai integration has no options of its own: Flue's decide the chat spans.
instrument(
  Sentry.createFlueInstrumentation({
    recordInputs: call =>
      (call.operation === 'chat' ? call.context.instanceId : call.observation.instanceId) === 'public',
    recordOutputs: () => privacy() === 'public',
  }),
);

const faux = fauxProvider({ provider: 'faux', models: [{ id: 'faux-model' }] });
const toolCall = fauxAssistantMessage(fauxToolCall('get_weather', { city: 'Berlin' }, { id: 'call_1' }), {
  stopReason: 'toolUse',
});
const answer = fauxAssistantMessage('It is sunny in Berlin.');
faux.setResponses([toolCall, answer, toolCall, answer]);

function Hello() {
  useModel('faux/faux-model');
  useTool({
    name: 'get_weather',
    description: 'Get the current weather for a city.',
    input: v.object({ city: v.string() }),
    run: ({ data }) => {
      // A tool span decides when it starts: flipping the tag here only reaches the requests after it.
      Sentry.getIsolationScope().setTag('privacy', 'public');
      return `It is sunny in ${data.city}.`;
    },
  });
  return 'You are a helpful assistant.';
}
__flueBindAgentModule(Hello, { identity: 'Hello' });

await Sentry.startSpan({ name: 'flue-test', op: 'function' }, async () => {
  const flue = await start({ agents: [Hello], providers: [faux.provider] });
  for (const id of ['public', 'private']) {
    await Sentry.withIsolationScope(async isolationScope => {
      isolationScope.setTag('privacy', id);
      await Sentry.startSpan({ name: `run ${id}` }, async () => {
        const agent = init(Hello, { id });
        await agent.read(await agent.dispatch('What is the weather in Berlin?'));
      });
    });
  }
  await flue[Symbol.asyncDispose]?.();
});

await Sentry.flush(2000);
