import { ChatAnthropic } from '@langchain/anthropic';
import { END, MessagesAnnotation, START, StateGraph } from '@langchain/langgraph';
import * as Sentry from '@sentry/node';
import express from 'express';
import { anthropicMessage, startMockServer } from '@sentry-internal/node-integration-tests';

function startMockAnthropicServer() {
  const app = express();
  app.use(express.json());

  app.post('/v1/messages', (req, res) => {
    res.json(
      anthropicMessage(req.body.model, {
        id: 'msg_stategraph_chat_1',
        content: 'Hello from mock.',
        usage: { input_tokens: 5, output_tokens: 3 },
      }),
    );
  });

  return startMockServer(app);
}

async function run() {
  const server = await startMockAnthropicServer();
  const baseUrl = server.url;

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const llm = new ChatAnthropic({
      model: 'claude-3-5-sonnet-20241022',
      apiKey: 'mock-api-key',
      clientOptions: { baseURL: baseUrl },
    });

    const callLlm = async state => {
      const response = await llm.invoke(state.messages);
      return { messages: [response] };
    };

    const graph = new StateGraph(MessagesAnnotation)
      .addNode('agent', callLlm)
      .addEdge(START, 'agent')
      .addEdge('agent', END)
      .compile({ name: 'plain_assistant' });

    await graph.invoke({ messages: [{ role: 'user', content: 'Hi.' }] });
  });

  await Sentry.flush(2000);
  server.close();
}

run();
