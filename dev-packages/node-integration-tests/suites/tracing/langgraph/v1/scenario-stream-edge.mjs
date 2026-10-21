import { FakeListChatModel } from '@langchain/core/utils/testing';
import { END, MessagesAnnotation, START, StateGraph } from '@langchain/langgraph';
import * as Sentry from '@sentry/node';

function weatherGraph(model) {
  return new StateGraph(MessagesAnnotation)
    .addNode('agent', async state => ({ messages: [await model.invoke(state.messages)] }))
    .addEdge(START, 'agent')
    .addEdge('agent', END);
}

async function run() {
  const model = new FakeListChatModel({ responses: ['Sunny', 'Cloudy', 'Rainy', 'Windy'] });
  const user = content => ({ messages: [{ role: 'user', content }] });

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const graph = weatherGraph(model).compile({ name: 'weather_graph' });

    const canceled = await graph.stream(user('Cancel while iterating'));
    try {
      for await (const _chunk of canceled) {
        await canceled.cancel('done');
      }
    } catch {
      // LangGraph rejects the next read after a cancel; the caller asked for it.
    }

    for await (const _chunk of await graph.stream(user('Stream with subgraphs'), {
      streamMode: 'values',
      subgraphs: true,
    })) {
      // drain
    }

    const [first, second] = (await graph.stream(user('Tee the forecast'))).tee();
    for await (const _chunk of first) {
      // drain
    }
    for await (const _chunk of second) {
      // drain
    }

    const manual = Sentry.instrumentStateGraph(weatherGraph(model), { recordInputs: false }).compile({
      name: 'manual_graph',
    });
    for await (const _chunk of await manual.stream(user('Keep this prompt private'))) {
      // drain
    }
  });
}

run();
