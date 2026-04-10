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

    // Multiple messages with long content (would normally be truncated and popped to last message only)
    const longContent = 'A'.repeat(50_000);
    await graph.invoke({
      messages: [
        { role: 'user', content: longContent },
        { role: 'assistant', content: 'Some reply' },
        { role: 'user', content: 'Follow-up question' },
      ],
    });
  });

  await Sentry.flush(2000);
}

run();
