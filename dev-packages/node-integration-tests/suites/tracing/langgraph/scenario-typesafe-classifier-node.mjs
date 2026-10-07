import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { TypeSafeClassifier } from '@langchain/typesafe';
import * as Sentry from '@sentry/node';

// Answer in-process through the classifier's `fetch` option, so no mock server is needed.
async function mockTypeSafeFetch() {
  return new Response(
    JSON.stringify({
      model: 'jev-1.13',
      answers: { urgent: { type: 'noul', noul: 0.9 } },
      usage: { input_tokens: 30, output_tokens: 2 },
    }),
    { headers: { 'content-type': 'application/json' } },
  );
}

async function run() {
  const classifier = new TypeSafeClassifier({
    apiKey: 'mock-api-key',
    fetch: mockTypeSafeFetch,
    questions: { urgent: { type: 'noul', instructions: 'Is this urgent?' } },
  });

  const State = Annotation.Root({ ticket: Annotation(), urgent: Annotation() });

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const graph = new StateGraph(State)
      .addNode('triage', async state => ({ urgent: (await classifier.invoke(state.ticket)).nouls.urgent.noul }))
      .addEdge(START, 'triage')
      .addEdge('triage', END)
      .compile({ name: 'triage_graph' });

    await graph.invoke({ ticket: 'My payouts have been failing.' });
  });

  await Sentry.flush(2000);
}

run();
