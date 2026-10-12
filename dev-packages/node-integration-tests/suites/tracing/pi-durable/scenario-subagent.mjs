import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { Type } from '@earendil-works/pi-ai';
import { createModels } from '@earendil-works/pi-ai/models';
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
import {
  AssistantEntry,
  createRegistry,
  defineExtension,
  defineTool,
  Harness,
  MemoryStorage,
} from '@earendil-works/pi-durable';

const context = BACKGROUND_CONTEXT;

// Three runs of the root conversation, each with one tool round:
// - `delegate` creates a conversation it owns and waits for its answer, the subagent pattern;
// - `fork_delegate` does the same with a fork of the current conversation;
// - `batch` runs the `inner` tool of its agent itself, passing its own api on.
// Each response is derived from the transcript, so the faux model answers every conversation.
const respond = transcript => {
  const lastUser = [...transcript.messages].reverse().find(message => message.role === 'user');
  const text =
    typeof lastUser.content === 'string' ? lastUser.content : lastUser.content.map(part => part.text).join('');
  const afterTool = transcript.messages.at(-1).role === 'toolResult';
  if (afterTool) {
    return fauxAssistantMessage(`Done: ${text}`);
  }
  if (text === 'Delegate the weather question.') {
    return fauxAssistantMessage(fauxToolCall('delegate', { task: 'Weather in Vienna?' }, { id: 'call_delegate' }), {
      stopReason: 'toolUse',
    });
  }
  if (text === 'Fork a helper.') {
    return fauxAssistantMessage(fauxToolCall('fork_delegate', {}, { id: 'call_fork' }), { stopReason: 'toolUse' });
  }
  if (text === 'Run the batch.') {
    return fauxAssistantMessage(fauxToolCall('batch', {}, { id: 'call_batch' }), { stopReason: 'toolUse' });
  }
  return fauxAssistantMessage(`Answer: ${text}`);
};
const faux = fauxProvider({ provider: 'faux', models: [{ id: 'faux-model' }] });
const models = createModels();
models.setProvider(faux.provider);
faux.setResponses(Array.from({ length: 12 }, () => respond));

const answerText = async (api, settled, toolContext) => {
  const answer = await api.commit(tx => tx.entry(AssistantEntry, settled.answer), toolContext);
  return (answer?.model?.[0]?.content ?? [])
    .filter(part => part.type === 'text')
    .map(part => part.text)
    .join('');
};

const registry = createRegistry();
registry.install(
  defineExtension({
    name: 'app',
    tools: [
      defineTool({
        name: 'delegate',
        description: 'Delegates a task to a subagent.',
        parameters: Type.Object({ task: Type.String() }),
        execute: async (args, api, toolContext) => {
          const childId = await api.commit(
            async tx => (await tx.createConversation({ ownership: { kind: 'task', taskId: api.taskId } })).id,
            toolContext,
          );
          const child = await api.conversation(childId, toolContext);
          const settled = await (
            await child.submit({ type: 'input', content: args.task }, toolContext)
          ).wait(toolContext);
          return { content: [{ type: 'text', text: await answerText(api, settled, toolContext) }] };
        },
      }),
      defineTool({
        name: 'fork_delegate',
        description: 'Forks this conversation into a subagent.',
        parameters: Type.Object({}),
        execute: async (_args, api, toolContext) => {
          const childId = await api.commit(async tx => {
            const at = (await tx.scanEntries({ conversationId: api.conversationId }, 1)).items[0].id;
            const fork = await tx.forkConversation(api.conversationId, at, {
              ownership: { kind: 'task', taskId: api.taskId },
            });
            return fork.id;
          }, toolContext);
          const child = await api.conversation(childId, toolContext);
          const settled = await (
            await child.submit({ type: 'input', content: 'Forked task.' }, toolContext)
          ).wait(toolContext);
          return { content: [{ type: 'text', text: await answerText(api, settled, toolContext) }] };
        },
      }),
      defineTool({
        name: 'inner',
        description: 'A plain tool.',
        parameters: Type.Object({}),
        execute: async () => ({ content: [{ type: 'text', text: 'INNER RESULT' }] }),
      }),
      defineTool({
        name: 'batch',
        description: 'Runs the inner tool itself.',
        parameters: Type.Object({}),
        execute: async (_args, api, toolContext) => {
          const inner = (await api.agent(toolContext)).tools.find(tool => tool.name === 'inner');
          await inner.execute({}, api, toolContext);
          return { content: [{ type: 'text', text: 'OUTER RESULT' }] };
        },
      }),
    ],
  }),
);

const harness = await Harness.open(new MemoryStorage(), { models, registry }, context);
const root = await harness.root(context, { agent: { model: { provider: 'faux', modelId: 'faux-model' } } });
for (const content of ['Delegate the weather question.', 'Fork a helper.', 'Run the batch.']) {
  await (await root.submit({ type: 'input', content }, context)).wait(context);
}
await harness.waitForIdle(context);
await harness.close(context);
