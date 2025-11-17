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

    // Define mock LLM function that returns with tool calls
    let callCount = 0;
    const mockLlmWithTools = () => {
      callCount++;

      // First call - return tool calls
      if (callCount === 1) {
        return {
          messages: [
            {
              role: 'assistant',
              content: '',
              response_metadata: {
                model_name: 'gpt-4-0613',
                finish_reason: 'tool_calls',
                tokenUsage: {
                  promptTokens: 30,
                  completionTokens: 20,
                  totalTokens: 50,
                },
              },
              tool_calls: [
                {
                  name: 'get_weather',
                  args: { city: 'San Francisco' },
                  id: 'call_123',
                  type: 'tool_call',
                },
              ],
            },
          ],
        };
      }

      // Second call - return final response after tool execution
      return {
        messages: [
          {
            role: 'assistant',
            content: 'Based on the weather data, it is sunny and 72 degrees in San Francisco.',
            response_metadata: {
              model_name: 'gpt-4-0613',
              finish_reason: 'stop',
              tokenUsage: {
                promptTokens: 50,
                completionTokens: 20,
                totalTokens: 70,
              },
            },
            tool_calls: [],
          },
        ],
      };
    };

    // Create graph with tool calls enabled
    const graphWithTools = new StateGraph(MessagesAnnotation)
      .addNode('agent', mockLlmWithTools)
      .addNode('tools', toolNode)
      .addEdge(START, 'agent')
      .addConditionalEdges('agent', shouldContinue, {
        tools: 'tools',
        [END]: END,
      })
      .addEdge('tools', 'agent')
      .compile({ name: 'tool_calling_agent' });

    // Invocation that actually calls tools
    await graphWithTools.invoke({
      messages: [{ role: 'user', content: 'What is the weather in San Francisco?' }],
    });
  });

  await Sentry.flush(2000);
}

run();
