import { ChatAnthropic } from '@langchain/anthropic';
import { END, MessagesAnnotation, START, StateGraph } from '@langchain/langgraph';
import * as Sentry from '@sentry/node';
import express from 'express';

function startMockAnthropicServer() {
  const app = express();
  app.use(express.json());

  app.post('/v1/messages', (req, res) => {
    res.json({
      id: 'msg_stategraph_chat_1',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'Hello from mock.' }],
      model: req.body.model,
      stop_reason: 'end_turn',
      usage: { input_tokens: 5, output_tokens: 3 },
    });
  });

  return new Promise(resolve => {
    const server = app.listen(0, () => resolve(server));
  });
}

async function run() {
  const server = await startMockAnthropicServer();
  const baseUrl = `http://localhost:${server.address().port}`;

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
