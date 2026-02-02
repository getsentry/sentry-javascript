import { END, MessagesAnnotation, START, StateGraph } from '@langchain/langgraph';
import * as Sentry from '@sentry/node';

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const mockLlm = () => {
      return {
        messages: [
          {
            role: 'assistant',
            content: 'Response',
            response_metadata: {
              model_name: 'mock-model',
              finish_reason: 'stop',
              tokenUsage: {
                promptTokens: 10,
                completionTokens: 5,
                totalTokens: 15,
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
      .compile({ name: 'test-agent' });

    await graph.invoke({
      messages: [
        { role: 'system', content: 'You are a helpful assistant' },
        { role: 'user', content: 'Hello' },
      ],
    });
  });

  await Sentry.flush(2000);
}

run();
