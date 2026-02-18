import { END, MessagesAnnotation, START, StateGraph } from '@langchain/langgraph';
import * as Sentry from '@sentry/node';

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'langgraph-test' }, async () => {
    // Define a simple mock LLM function
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

    // Create and compile the graph
    const graph = new StateGraph(MessagesAnnotation)
      .addNode('agent', mockLlm)
      .addEdge(START, 'agent')
      .addEdge('agent', END)
      .compile({ name: 'weather_assistant' });

    // Test: basic invocation
    await graph.invoke({
      messages: [{ role: 'user', content: 'What is the weather today?' }],
    });

    // Test: invocation with multiple messages
    await graph.invoke({
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'Tell me about the weather' },
      ],
    });
  });

  await Sentry.flush(2000);
}

run();
