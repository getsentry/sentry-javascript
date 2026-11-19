import * as Sentry from '@sentry/node';
import { __flueBindAgentModule, init, instrument, useModel, useTool } from '@flue/runtime';
import { start } from '@flue/runtime/node';
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
import * as v from 'valibot';

instrument(
  Sentry.createFlueInstrumentation({
    recordInputs: call => (call.operation === 'chat' ? call.context : call.observation).instanceId === 'public',
    recordOutputs: () => Sentry.getIsolationScope().getScopeData().tags.privacy === 'public',
    onSpanStart: (span, { operation }) => {
      span.setAttribute('test.start', [operation, Sentry.getIsolationScope().getScopeData().tags.privacy].join(':'));
    },
    onSpanEnd: (span, { operation }, { response }) => {
      span.setAttribute('test.end', operation === 'chat' ? response?.stopReason : response?.type);
    },
  }),
);

const faux = fauxProvider({ provider: 'faux', models: [{ id: 'faux-model' }] });
faux.setResponses([
  fauxAssistantMessage(fauxToolCall('get_weather', { city: 'Berlin' }, { id: 'call_1' }), { stopReason: 'toolUse' }),
  fauxAssistantMessage('It is sunny in Berlin.'),
]);

function Hello() {
  useModel('faux/faux-model');
  useTool({
    name: 'get_weather',
    description: 'Get the current weather for a city.',
    input: v.object({ city: v.string() }),
    run: ({ data }) => {
      Sentry.getIsolationScope().setTag('privacy', 'public');
      return `It is sunny in ${data.city}.`;
    },
  });
  return 'You are a helpful assistant.';
}
__flueBindAgentModule(Hello, { identity: 'Hello' });

const flue = await start({ agents: [Hello], providers: [faux.provider] });
await Sentry.withIsolationScope(async isolationScope => {
  isolationScope.setTag('privacy', 'private');
  await Sentry.startSpan({ name: 'flue-test' }, async () => {
    const agent = init(Hello, { id: 'public' });
    await agent.read(await agent.dispatch('What is the weather in Berlin?'));
  });
});
await flue[Symbol.asyncDispose]?.();

await Sentry.flush(2000);
