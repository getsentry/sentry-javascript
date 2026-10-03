import * as Sentry from '@sentry/node';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { Type } from '@earendil-works/pi-ai';
import { createModels } from '@earendil-works/pi-ai/models';
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
import { createRegistry, defineExtension, defineTool, Harness, MemoryStorage } from '@earendil-works/pi-durable';

const context = BACKGROUND_CONTEXT;

// Two conversations run at the same time, each submitted from its own request with its own scope
// data. Each response is derived from the transcript, and the delays make the two runs interleave.
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const respond = async transcript => {
  const lastUser = [...transcript.messages].reverse().find(message => message.role === 'user');
  const prompt =
    typeof lastUser.content === 'string' ? lastUser.content : lastUser.content.map(part => part.text).join('');
  const afterTool = transcript.messages.some(message => message.role === 'toolResult');
  await delay(prompt.includes('A') ? 30 : 10);
  return afterTool
    ? fauxAssistantMessage(`Answer for ${prompt}`)
    : fauxAssistantMessage(fauxToolCall('work', { tag: prompt }, { id: `call_${prompt.at(-1)}` }), {
        stopReason: 'toolUse',
      });
};
const faux = fauxProvider({ provider: 'faux', models: [{ id: 'faux-model' }] });
const models = createModels();
models.setProvider(faux.provider);
faux.setResponses([respond, respond, respond, respond]);

const registry = createRegistry();
registry.install(
  defineExtension({
    name: 'app',
    tools: [
      defineTool({
        name: 'work',
        description: 'Works for a while, then fails.',
        parameters: Type.Object({ tag: Type.String() }),
        execute: async args => {
          await delay(args.tag.includes('A') ? 10 : 30);
          throw new Error(`work failed for ${args.tag}`);
        },
      }),
    ],
  }),
);

const harness = await Harness.open(new MemoryStorage(), { models, registry }, context);
const model = { provider: 'faux', modelId: 'faux-model' };
const a = await harness.createConversation({ ownership: { kind: 'ownerless' }, agent: { model } }, context);
const b = await harness.createConversation({ ownership: { kind: 'ownerless' }, agent: { model } }, context);

// Each request has its own isolation scope, as it would in a server, with data of its own.
const ask = (conversation, request) =>
  Sentry.withIsolationScope(async isolationScope => {
    isolationScope.setTag('request', request);
    isolationScope.setConversationId(`scope-of-${request}`);
    await (await conversation.submit({ type: 'input', content: request }, context)).wait(context);
  });
await Promise.all([ask(a, 'request A'), ask(b, 'request B')]);
await harness.close(context);
