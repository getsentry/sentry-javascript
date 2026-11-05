import * as Sentry from '@sentry/aws-serverless';
import { BedrockRuntimeClient, ConverseCommand, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
// Force the HTTP/1 handler so `nock` can intercept the request instead of hitting real AWS.
import { NodeHttpHandler } from '@smithy/node-http-handler';
import nock from 'nock';

nock.disableNetConnect();

const region = 'us-east-1';
const credentials = { accessKeyId: 'aws-test-key', secretAccessKey: 'aws-test-secret' };
const host = `https://bedrock-runtime.${region}.amazonaws.com`;

async function converse() {
  const client = new BedrockRuntimeClient({
    region,
    credentials,
    maxAttempts: 1,
    requestHandler: new NodeHttpHandler(),
  });

  nock(host)
    .post(/\/model\/.*\/converse$/)
    .reply(
      200,
      JSON.stringify({
        output: {
          message: {
            role: 'assistant',
            content: [
              { text: 'Hello from Bedrock' },
              { toolUse: { toolUseId: 'tooluse_1', name: 'get_weather', input: { city: 'Vienna' } } },
            ],
          },
        },
        stopReason: 'tool_use',
        usage: { inputTokens: 12, outputTokens: 8, totalTokens: 20 },
      }),
      { 'content-type': 'application/json' },
    );

  await client.send(
    new ConverseCommand({
      modelId: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
      system: [{ text: 'You are a helpful assistant.' }],
      messages: [{ role: 'user', content: [{ text: 'Hello' }] }],
      inferenceConfig: { maxTokens: 100, temperature: 0.5, topP: 0.9 },
      toolConfig: {
        tools: [
          {
            toolSpec: {
              name: 'get_weather',
              description: 'Get the weather for a city',
              inputSchema: { json: { type: 'object', properties: { city: { type: 'string' } } } },
            },
          },
        ],
      },
    }),
  );
}

async function invokeModel() {
  const client = new BedrockRuntimeClient({
    region,
    credentials,
    maxAttempts: 1,
    requestHandler: new NodeHttpHandler(),
  });

  nock(host)
    .post(/\/model\/.*\/invoke$/)
    .reply(
      200,
      JSON.stringify({
        id: 'msg_bdrk_1',
        model: 'claude-3-5-sonnet-20240620',
        content: [{ type: 'text', text: 'Hello from Bedrock' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 15, output_tokens: 9 },
      }),
      { 'content-type': 'application/json' },
    );

  await client.send(
    new InvokeModelCommand({
      modelId: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
      contentType: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 100,
        temperature: 0.5,
        top_p: 0.9,
        system: 'You are a helpful assistant.',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Hello' },
              { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' } },
            ],
          },
          { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_1', name: 'get_report', input: {} }] },
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'toolu_1',
                content: [
                  { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERi0xLjQ=' } },
                ],
              },
            ],
          },
        ],
      }),
    }),
  );
}

async function run() {
  await Sentry.startSpan({ name: 'Test Transaction' }, async () => {
    await converse();
    await invokeModel();
  });
}

run();
