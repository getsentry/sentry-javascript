import { END, MemorySaver, MessagesAnnotation, START, StateGraph } from '@langchain/langgraph';
import * as Sentry from '@sentry/node';

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'langgraph-resume-test' }, async () => {
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

    // Test: invoke with null input (resume after human-in-the-loop interrupt)
    // See: https://docs.langchain.com/oss/javascript/langgraph/use-functional-api#resuming-after-an-error
    const checkpointer = new MemorySaver();
    const graph = new StateGraph(MessagesAnnotation)
      .addNode('agent', mockLlm)
      .addEdge(START, 'agent')
      .addEdge('agent', END)
      .compile({ name: 'resume_agent', checkpointer });

    const config = { configurable: { thread_id: 'resume-thread-1' } };
    await graph.invoke({ messages: [{ role: 'user', content: 'Hello' }] }, config);
    await graph.invoke(null, config);
  });

  await Sentry.flush(2000);
}

run();
