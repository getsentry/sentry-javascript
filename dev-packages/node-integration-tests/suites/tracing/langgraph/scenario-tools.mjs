import { tool } from '@langchain/core/tools';
import { END, MessagesAnnotation, START, StateGraph } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import * as Sentry from '@sentry/node';
import { z } from 'zod';

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'langgraph-tools-test' }, async () => {
    // Define tools
    const getWeatherTool = tool(
      async ({ city }) => {
        return JSON.stringify({ city, temperature: 72, condition: 'sunny' });
      },
      {
        name: 'get_weather',
        description: 'Get the current weather for a given city',
        schema: z.object({
          city: z.string().describe('The city to get weather for'),
        }),
      },
    );

    const getTimeTool = tool(
      async () => {
        return new Date().toISOString();
      },
      {
        name: 'get_time',
        description: 'Get the current time',
        schema: z.object({}),
      },
    );

    const tools = [getWeatherTool, getTimeTool];
    const toolNode = new ToolNode(tools);

    // Define mock LLM function that returns without tool calls
    const mockLlm = () => {
      return {
        messages: [
          {
            role: 'assistant',
            content: 'Response without calling tools',
            response_metadata: {
              model_name: 'gpt-4-0613',
              finish_reason: 'stop',
              tokenUsage: {
                promptTokens: 25,
                completionTokens: 15,
                totalTokens: 40,
              },
            },
            tool_calls: [],
          },
        ],
      };
    };

    // Routing function - check if there are tool calls
    const shouldContinue = state => {
      const messages = state.messages;
      const lastMessage = messages[messages.length - 1];

      // If the last message has tool_calls, route to tools, otherwise end
      if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
        return 'tools';
      }
      return END;
    };

    // Create graph with conditional edge to tools
    const graph = new StateGraph(MessagesAnnotation)
      .addNode('agent', mockLlm)
      .addNode('tools', toolNode)
      .addEdge(START, 'agent')
      .addConditionalEdges('agent', shouldContinue, {
        tools: 'tools',
        [END]: END,
      })
      .addEdge('tools', 'agent')
      .compile({ name: 'tool_agent' });

    // Simple invocation - won't call tools since mockLlm returns empty tool_calls
    await graph.invoke({
      messages: [{ role: 'user', content: 'What is the weather?' }],
    });
  });

  await Sentry.flush(2000);
}

run();
