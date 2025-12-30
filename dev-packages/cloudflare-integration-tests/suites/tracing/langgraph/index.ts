import { END, MessagesAnnotation, START, StateGraph } from '@langchain/langgraph';
import * as Sentry from '@sentry/cloudflare';

interface Env {
  SENTRY_DSN: string;
}

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
    sendDefaultPii: true,
  }),
  {
    async fetch(_request, _env, _ctx) {
      // Define simple mock LLM function
      const mockLlm = (): {
        messages: {
          role: string;
          content: string;
          response_metadata: {
            model_name: string;
            finish_reason: string;
            tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number };
          };
          tool_calls: never[];
        }[];
      } => {
        return {
          messages: [
            {
              role: 'assistant',
              content: 'Mock response from LangGraph agent',
              response_metadata: {
                model_name: 'mock-model',
                finish_reason: 'stop',
                tokenUsage: {
                  promptTokens: 20,
                  completionTokens: 10,
                  totalTokens: 30,
                },
              },
              tool_calls: [],
            },
          ],
        };
      };

      // Create and instrument the graph
      const graph = new StateGraph(MessagesAnnotation)
        .addNode('agent', mockLlm)
        .addEdge(START, 'agent')
        .addEdge('agent', END);

      Sentry.instrumentLangGraph(graph, { recordInputs: true, recordOutputs: true });

      const compiled = graph.compile({ name: 'weather_assistant' });

      await compiled.invoke({
        messages: [{ role: 'user', content: 'What is the weather in SF?' }],
      });

      return new Response(JSON.stringify({ success: true }));
    },
  },
);
