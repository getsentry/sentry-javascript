import { END, MessagesAnnotation, START, StateGraph } from '@langchain/langgraph';
import * as Sentry from '@sentry/node';

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'langgraph-thread-id-test' }, async () => {
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
      .compile({ name: 'thread_test_agent' });

    // Test 1: Invoke with thread_id in config
    await graph.invoke(
      {
        messages: [{ role: 'user', content: 'Hello with thread ID' }],
      },
      {
        configurable: {
          thread_id: 'thread_abc123_session_1',
        },
      },
    );

    // Test 2: Invoke with different thread_id (simulating different conversation)
    await graph.invoke(
      {
        messages: [{ role: 'user', content: 'Different conversation' }],
      },
      {
        configurable: {
          thread_id: 'thread_xyz789_session_2',
        },
      },
    );

    // Test 3: Invoke without thread_id (should not have gen_ai.conversation.id)
    await graph.invoke({
      messages: [{ role: 'user', content: 'No thread ID here' }],
    });
  });

  await Sentry.flush(2000);
}

run();
