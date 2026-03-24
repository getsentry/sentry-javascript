import * as Sentry from '@sentry/node';
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';

function startMockAnthropicServer() {
  const app = express();
  app.use(express.json());

  app.post('/anthropic/v1/messages', (req, res) => {
    const model = req.body.model;

    res.set('request-id', 'req_withresponse_test');

    if (req.body.stream) {
      res.set('content-type', 'text/event-stream');
      res.flushHeaders();

      const events = [
        `event: message_start\ndata: ${JSON.stringify({ type: 'message_start', message: { id: 'msg_stream_withresponse', type: 'message', role: 'assistant', model, content: [], usage: { input_tokens: 10 } } })}\n\n`,
        `event: content_block_start\ndata: ${JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })}\n\n`,
        `event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Streaming with response!' } })}\n\n`,
        `event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index: 0 })}\n\n`,
        `event: message_delta\ndata: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } })}\n\n`,
        `event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`,
      ];

      let i = 0;
      const interval = setInterval(() => {
        if (i < events.length) {
          res.write(events[i]);
          i++;
        } else {
          clearInterval(interval);
          res.end();
        }
      }, 10);
      return;
    }

    res.send({
      id: 'msg_withresponse',
      type: 'message',
      model: model,
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: 'Testing .withResponse() method!',
        },
      ],
    });
  });

  return new Promise(resolve => {
    const server = app.listen(0, () => {
      resolve(server);
    });
  });
}

async function run() {
  const server = await startMockAnthropicServer();

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const client = new Anthropic({
      apiKey: 'mock-api-key',
      baseURL: `http://localhost:${server.address().port}/anthropic`,
    });

    // Test 1: Verify .withResponse() method is preserved and works correctly
    const result = client.messages.create({
      model: 'claude-3-haiku-20240307',
      messages: [{ role: 'user', content: 'Test withResponse' }],
    });

    // Verify .withResponse() method exists and can be called
    if (typeof result.withResponse !== 'function') {
      throw new Error('.withResponse() method does not exist');
    }

    // Call .withResponse() and verify structure
    const withResponseResult = await result.withResponse();

    // Verify expected properties are present
    if (!withResponseResult.data) {
      throw new Error('.withResponse() did not return data');
    }
    if (!withResponseResult.response) {
      throw new Error('.withResponse() did not return response');
    }
    if (withResponseResult.request_id === undefined) {
      throw new Error('.withResponse() did not return request_id');
    }

    // Verify returned data structure matches expected Anthropic response
    const { data } = withResponseResult;
    if (data.id !== 'msg_withresponse') {
      throw new Error(`Expected data.id to be 'msg_withresponse', got '${data.id}'`);
    }
    if (data.model !== 'claude-3-haiku-20240307') {
      throw new Error(`Expected data.model to be 'claude-3-haiku-20240307', got '${data.model}'`);
    }
    if (data.content[0].text !== 'Testing .withResponse() method!') {
      throw new Error(
        `Expected data.content[0].text to be 'Testing .withResponse() method!', got '${data.content[0].text}'`,
      );
    }

    // Verify response is a Response object with correct headers
    if (!(withResponseResult.response instanceof Response)) {
      throw new Error('response is not a Response object');
    }
    if (withResponseResult.response.headers.get('request-id') !== 'req_withresponse_test') {
      throw new Error(
        `Expected request-id header 'req_withresponse_test', got '${withResponseResult.response.headers.get('request-id')}'`,
      );
    }

    // Verify request_id matches the header
    if (withResponseResult.request_id !== 'req_withresponse_test') {
      throw new Error(`Expected request_id 'req_withresponse_test', got '${withResponseResult.request_id}'`);
    }

    // Test 2: Verify .asResponse() method works
    const result2 = client.messages.create({
      model: 'claude-3-haiku-20240307',
      messages: [{ role: 'user', content: 'Test asResponse' }],
    });

    // Verify .asResponse() method exists and can be called
    if (typeof result2.asResponse !== 'function') {
      throw new Error('.asResponse() method does not exist');
    }

    // Call .asResponse() and verify it returns raw Response
    const rawResponse = await result2.asResponse();

    // Verify response is a Response object with correct headers
    if (!(rawResponse instanceof Response)) {
      throw new Error('.asResponse() did not return a Response object');
    }

    // Verify response has correct status
    if (rawResponse.status !== 200) {
      throw new Error(`Expected status 200, got ${rawResponse.status}`);
    }

    // Verify response headers
    if (rawResponse.headers.get('request-id') !== 'req_withresponse_test') {
      throw new Error(
        `Expected request-id header 'req_withresponse_test', got '${rawResponse.headers.get('request-id')}'`,
      );
    }

    // Test 3: Verify .withResponse() works with streaming (stream: true)
    const streamResult = client.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'Test stream withResponse' }],
      stream: true,
    });

    if (typeof streamResult.withResponse !== 'function') {
      throw new Error('.withResponse() method does not exist on streaming result');
    }

    const streamWithResponse = await streamResult.withResponse();

    if (!streamWithResponse.data) {
      throw new Error('streaming .withResponse() did not return data');
    }
    if (!streamWithResponse.response) {
      throw new Error('streaming .withResponse() did not return response');
    }
    if (streamWithResponse.request_id === undefined) {
      throw new Error('streaming .withResponse() did not return request_id');
    }

    if (!(streamWithResponse.response instanceof Response)) {
      throw new Error('streaming response is not a Response object');
    }
    if (streamWithResponse.response.headers.get('request-id') !== 'req_withresponse_test') {
      throw new Error(
        `Expected request-id header 'req_withresponse_test', got '${streamWithResponse.response.headers.get('request-id')}'`,
      );
    }

    // Consume the stream to allow span to complete
    for await (const _ of streamWithResponse.data) {
      void _;
    }
  });

  // Wait for the stream event handler to finish
  await Sentry.flush(2000);

  server.close();
}

run();
