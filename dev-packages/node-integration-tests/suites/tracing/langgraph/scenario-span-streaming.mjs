import { END, MessagesAnnotation, START, StateGraph } from '@langchain/langgraph';
import * as Sentry from '@sentry/node';

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'langgraph-test' }, async () => {
    const mockLlm = () => {
      return {
        messages: [
          {
            role: 'assistant',
            content: 'Mock LLM response',
            response_metadata: {
              model_name: 'mock-model',
              finish_reason: 'stop',
              tokenUsage: {
                promptTokens: 20,
                completionTokens: 10,
                totalTokens: 30,
              },
            },
          },
        ],
      };
    };

    const graph = new StateGraph(MessagesAnnotation)
      .addNode('agent', mockLlm)
      .addEdge(START, 'agent')
      .addEdge('agent', END)
      .compile({ name: 'weather_assistant' });

    // Single long message so truncation must crop it
    const longContent = 'A'.repeat(50_000);
    await graph.invoke({
      messages: [{ role: 'user', content: longContent }],
    });
  });

  await Sentry.flush(2000);
}

run();
