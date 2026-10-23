import { FakeListChatModel } from '@langchain/core/utils/testing';
import { END, MessagesAnnotation, START, StateGraph } from '@langchain/langgraph';
import * as Sentry from '@sentry/node';

async function run() {
  const model = new FakeListChatModel({ responses: ['Sunny', 'Cloudy', 'Rainy'] });

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const graph = new StateGraph(MessagesAnnotation)
      .addNode('agent', async state => ({ messages: [await model.invoke(state.messages)] }))
      .addEdge(START, 'agent')
      .addEdge('agent', END)
      .compile({ name: 'weather_graph' });

    await graph.invoke({ messages: [{ role: 'user', content: 'Invoke the forecast' }] });

    for await (const _chunk of await graph.stream({ messages: [{ role: 'user', content: 'Stream the forecast' }] })) {
      // Consume the whole stream.
    }

    for await (const _chunk of await graph.stream(
      { messages: [{ role: 'user', content: 'Abandon the forecast' }] },
      { streamMode: 'values' },
    )) {
      break;
    }
  });
}

run();
