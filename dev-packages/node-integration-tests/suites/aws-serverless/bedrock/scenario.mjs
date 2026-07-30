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
        output: { message: { role: 'assistant', content: [{ text: 'Hello from Bedrock' }] } },
        stopReason: 'end_turn',
        usage: { inputTokens: 12, outputTokens: 8, totalTokens: 20 },
      }),
      { 'content-type': 'application/json' },
    );

  await client.send(
    new ConverseCommand({
      modelId: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
      messages: [{ role: 'user', content: [{ text: 'Hello' }] }],
      inferenceConfig: { maxTokens: 100, temperature: 0.5, topP: 0.9 },
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
        messages: [{ role: 'user', content: 'Hello' }],
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
