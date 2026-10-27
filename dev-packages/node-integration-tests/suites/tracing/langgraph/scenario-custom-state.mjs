import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import * as Sentry from '@sentry/node';

// A graph built on a custom `Annotation.Root` state (no `messages` channel). The invoke_agent span
// records the whole state object on both the input and the output side, unlike the MessagesAnnotation
// graphs the other scenarios use.
const CustomState = Annotation.Root({
  topic: Annotation(),
  summary: Annotation(),
});

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const summarize = state => {
      return { summary: `Summary of ${state.topic}` };
    };

    const graph = new StateGraph(CustomState)
      .addNode('summarize', summarize)
      .addEdge(START, 'summarize')
      .addEdge('summarize', END)
      .compile({ name: 'custom_state_agent' });

    await graph.invoke({ topic: 'weather' });
  });

  await Sentry.flush(2000);
}

run();
