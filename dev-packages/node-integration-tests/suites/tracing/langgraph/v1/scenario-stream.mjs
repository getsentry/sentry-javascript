import { RunnableLambda } from '@langchain/core/runnables';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import { Command, END, interrupt, MemorySaver, MessagesAnnotation, START, StateGraph } from '@langchain/langgraph';
import * as Sentry from '@sentry/node';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const user = content => ({ messages: [{ role: 'user', content }] });
const drain = async stream => {
  for await (const _chunk of stream) {
    // drain
  }
};

function weatherBuilder(model) {
  return new StateGraph(MessagesAnnotation)
    .addNode('agent', async state => ({ messages: [await model.invoke(state.messages)] }))
    .addEdge(START, 'agent')
    .addEdge('agent', END);
}

async function run() {
  const model = new FakeListChatModel({ responses: ['Sunny'] });

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const graph = weatherBuilder(model).compile({ name: 'weather_graph' });

    await drain(await graph.stream(user('Read the whole stream')));
    await graph.stream(user('Never read the stream'));
    for await (const _chunk of await graph.stream(user('Break out of the stream'))) {
      break;
    }
    const canceled = await graph.stream(user('Cancel the stream'));
    await canceled.cancel();

    const slow = new StateGraph(MessagesAnnotation)
      .addNode('agent', async () => {
        await sleep(200);
        return { messages: [] };
      })
      .addEdge(START, 'agent')
      .addEdge('agent', END)
      .compile({ name: 'slow_graph' });
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 50);
    try {
      await drain(await slow.stream(user('Abort the stream'), { signal: controller.signal }));
    } catch {
      // expected
    }

    const failing = new StateGraph(MessagesAnnotation)
      .addNode('agent', async () => {
        throw new Error('Weather service down');
      })
      .addEdge(START, 'agent')
      .addEdge('agent', END)
      .compile({ name: 'failing_graph' });
    try {
      await drain(await failing.stream(user('Fail the stream')));
    } catch {
      // expected
    }

    const approval = new StateGraph(MessagesAnnotation)
      .addNode('ask', async () => ({ messages: [{ role: 'user', content: String(interrupt('Approve?')) }] }))
      .addEdge(START, 'ask')
      .addEdge('ask', END)
      .compile({ name: 'approval_graph', checkpointer: new MemorySaver() });
    const thread = { configurable: { thread_id: 'approval' } };
    await drain(await approval.stream(user('Interrupt the stream'), thread));
    await drain(await approval.stream(new Command({ resume: 'yes' }), thread));

    await drain(await graph.streamEvents(user('Stream events v3'), { version: 'v3' }));

    const recursive = new StateGraph(MessagesAnnotation)
      .addNode('agent', async state => {
        if (state.messages.length === 1 && state.messages[0].content === 'Invoke with a nested stream') {
          await drain(await recursive.stream(user('Nested stream of the same graph')));
        }
        return { messages: [{ role: 'assistant', content: 'done' }] };
      })
      .addEdge(START, 'agent')
      .addEdge('agent', END)
      .compile({ name: 'recursive_graph' });
    await recursive.invoke(user('Invoke with a nested stream'));

    // Passing the parent's config hands stream() a CallbackManager rather than an array.
    await RunnableLambda.from(async (input, config) => drain(await graph.stream(input, config))).invoke(
      user('Stream inside a runnable'),
    );

    const manual = Sentry.instrumentStateGraph(weatherBuilder(model), { recordInputs: false }).compile({
      name: 'manual_graph',
    });
    await drain(await manual.stream(user('Keep this prompt private')));

    // Lets the unread stream's run finish before the root span ends.
    await sleep(200);
  });
}

run();
