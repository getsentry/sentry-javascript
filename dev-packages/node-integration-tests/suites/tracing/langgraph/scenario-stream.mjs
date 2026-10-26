import { RunnableLambda } from '@langchain/core/runnables';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import { END, MessagesAnnotation, START, StateGraph } from '@langchain/langgraph';
import * as Sentry from '@sentry/node';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const user = content => ({ messages: [{ role: 'user', content }] });

function weatherGraph(name, model) {
  return new StateGraph(MessagesAnnotation)
    .addNode('agent', async state => ({ messages: [await model.invoke(state.messages)] }))
    .addEdge(START, 'agent')
    .addEdge('agent', END)
    .compile({ name });
}

async function run() {
  const model = new FakeListChatModel({ responses: ['Sunny'] });

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const graph = weatherGraph('weather_graph', model);

    for await (const _chunk of await graph.stream(user('Read the whole stream'))) {
      // drain
    }

    await graph.stream(user('Never read the stream'));

    for await (const _chunk of await graph.stream(user('Break out of the stream'))) {
      break;
    }

    const canceled = await graph.stream(user('Cancel the stream'));
    await canceled.cancel();

    const failing = new StateGraph(MessagesAnnotation)
      .addNode('agent', async () => {
        throw new Error('Weather service down');
      })
      .addEdge(START, 'agent')
      .addEdge('agent', END)
      .compile({ name: 'failing_graph' });
    try {
      for await (const _chunk of await failing.stream(user('Fail the stream'))) {
        // drain
      }
    } catch {
      // expected
    }

    const outer = new StateGraph(MessagesAnnotation)
      .addNode('inner', weatherGraph('inner_graph', model))
      .addEdge(START, 'inner')
      .addEdge('inner', END)
      .compile({ name: 'outer_graph' });
    for await (const _chunk of await outer.stream(user('Stream a subgraph'))) {
      // drain
    }

    for await (const _event of graph.streamEvents(user('Stream events'), { version: 'v2' })) {
      // drain
    }

    await graph.invoke(user('Invoke the graph'));

    // stream() called without config inside a parent run must keep reporting to the parent's callbacks.
    let parentSawGraphRun = false;
    const parentCallback = {
      handleChainStart: (_chain, _inputs, _runId, _parentRunId, _tags, metadata) => {
        if (metadata?.lc_agent_name === 'weather_graph') {
          parentSawGraphRun = true;
        }
      },
    };
    await RunnableLambda.from(async input => {
      for await (const _chunk of await graph.stream(input)) {
        // drain
      }
    }).invoke(user('Stream inside a parent run'), { callbacks: [parentCallback] });
    Sentry.startSpan(
      { name: 'parent callbacks', attributes: { 'test.parent_saw_graph_run': parentSawGraphRun } },
      () => {},
    );

    // Lets the unread stream's run finish before the root span ends.
    await sleep(200);
  });
}

run();
