import * as Sentry from '@sentry/node';
import express from 'express';
import OpenAI from 'openai';

function startMockServer() {
  const app = express();
  app.use(express.json());

  app.post('/openai/chat/completions', (req, res) => {
    const { model } = req.body;

    res.set({
      'x-request-id': 'req_withresponse_test',
      'openai-organization': 'test-org',
      'openai-processing-ms': '150',
      'openai-version': '2020-10-01',
    });

    res.send({
      id: 'chatcmpl-withresponse',
      object: 'chat.completion',
      created: 1677652288,
      model: model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'Testing .withResponse() method!',
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 8,
        completion_tokens: 12,
        total_tokens: 20,
      },
    });
  });

  return new Promise(resolve => {
    const server = app.listen(0, () => {
      resolve(server);
    });
  });
}

async function run() {
  const server = await startMockServer();

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const client = new OpenAI({
      baseURL: `http://localhost:${server.address().port}/openai`,
      apiKey: 'mock-api-key',
    });

    // Verify .withResponse() method exists and can be called
    const result = client.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Test withResponse' }],
    });

    // Verify method exists
    if (typeof result.withResponse !== 'function') {
      throw new Error('.withResponse() method does not exist');
    }

    // Call .withResponse() and verify structure
    const withResponseResult = await result.withResponse();

    // Verify all three properties exist
    if (!withResponseResult.data) {
      throw new Error('.withResponse() did not return data');
    }
    if (!withResponseResult.response) {
      throw new Error('.withResponse() did not return response');
    }
    if (withResponseResult.request_id === undefined) {
      throw new Error('.withResponse() did not return request_id');
    }

    // Verify data structure matches expected OpenAI response
    const { data } = withResponseResult;
    if (data.id !== 'chatcmpl-withresponse') {
      throw new Error(`Expected data.id to be 'chatcmpl-withresponse', got '${data.id}'`);
    }
    if (data.choices[0].message.content !== 'Testing .withResponse() method!') {
      throw new Error(`Expected specific content, got '${data.choices[0].message.content}'`);
    }
    if (data.usage.total_tokens !== 20) {
      throw new Error(`Expected 20 total tokens, got ${data.usage.total_tokens}`);
    }

    // Verify response is a Response object with correct headers
    if (!(withResponseResult.response instanceof Response)) {
      throw new Error('response is not a Response object');
    }
    if (withResponseResult.response.headers.get('x-request-id') !== 'req_withresponse_test') {
      throw new Error(
        `Expected x-request-id header 'req_withresponse_test', got '${withResponseResult.response.headers.get('x-request-id')}'`,
      );
    }

    // Verify request_id matches the header
    if (withResponseResult.request_id !== 'req_withresponse_test') {
      throw new Error(`Expected request_id 'req_withresponse_test', got '${withResponseResult.request_id}'`);
    }

    // Test 2: Verify .asResponse() method works
    const result2 = client.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Test asResponse' }],
    });

    // Verify method exists
    if (typeof result2.asResponse !== 'function') {
      throw new Error('.asResponse() method does not exist');
    }

    // Call .asResponse() and verify it returns raw Response
    const rawResponse = await result2.asResponse();

    if (!(rawResponse instanceof Response)) {
      throw new Error('.asResponse() did not return a Response object');
    }

    // Verify response has correct status
    if (rawResponse.status !== 200) {
      throw new Error(`Expected status 200, got ${rawResponse.status}`);
    }

    // Verify response headers
    if (rawResponse.headers.get('x-request-id') !== 'req_withresponse_test') {
      throw new Error(
        `Expected x-request-id header 'req_withresponse_test', got '${rawResponse.headers.get('x-request-id')}'`,
      );
    }

    // Verify we can manually parse the body
    const body = await rawResponse.json();
    if (body.id !== 'chatcmpl-withresponse') {
      throw new Error(`Expected body.id 'chatcmpl-withresponse', got '${body.id}'`);
    }
    if (body.choices[0].message.content !== 'Testing .withResponse() method!') {
      throw new Error(`Expected specific content in body, got '${body.choices[0].message.content}'`);
    }
  });

  server.close();
}

run();
