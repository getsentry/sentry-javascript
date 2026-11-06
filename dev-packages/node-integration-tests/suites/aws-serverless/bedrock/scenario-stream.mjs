import * as Sentry from '@sentry/aws-serverless';
import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
  InvokeModelWithResponseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';
// Force the HTTP/1 handler so `nock` can intercept the request instead of hitting real AWS.
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { EventStreamCodec } from '@smithy/core/event-streams';
import nock from 'nock';
import { Buffer } from 'node:buffer';

nock.disableNetConnect();

const region = 'us-east-1';
const credentials = { accessKeyId: 'aws-test-key', secretAccessKey: 'aws-test-secret' };
const host = `https://bedrock-runtime.${region}.amazonaws.com`;
const modelId = 'anthropic.claude-3-5-sonnet-20240620-v1:0';

const codec = new EventStreamCodec(
  bytes => Buffer.from(bytes).toString('utf8'),
  text => Buffer.from(text),
);

function encodeMessage(headers, payload) {
  return codec.encode({
    headers: Object.fromEntries(Object.entries(headers).map(([name, value]) => [name, { type: 'string', value }])),
    body: Buffer.from(JSON.stringify(payload)),
  });
}

function event(eventType, payload) {
  return encodeMessage(
    { ':message-type': 'event', ':event-type': eventType, ':content-type': 'application/json' },
    payload,
  );
}

function exception(exceptionType, payload) {
  return encodeMessage(
    { ':message-type': 'exception', ':exception-type': exceptionType, ':content-type': 'application/json' },
    payload,
  );
}

function invokeModelChunk(chunk) {
  return event('chunk', { bytes: Buffer.from(JSON.stringify(chunk)).toString('base64') });
}

function mockStream(path, messages) {
  nock(host).post(path).reply(200, Buffer.concat(messages), { 'content-type': 'application/vnd.amazon.eventstream' });
}

function createClient() {
  return new BedrockRuntimeClient({ region, credentials, maxAttempts: 1, requestHandler: new NodeHttpHandler() });
}

async function converseStream() {
  mockStream(/\/model\/.*\/converse-stream$/, [
    event('messageStart', { role: 'assistant' }),
    event('contentBlockDelta', { contentBlockIndex: 0, delta: { text: 'Hello ' } }),
    event('contentBlockDelta', { contentBlockIndex: 0, delta: { text: 'from Bedrock' } }),
    event('contentBlockStop', { contentBlockIndex: 0 }),
    event('contentBlockStart', {
      contentBlockIndex: 1,
      start: { toolUse: { toolUseId: 'tooluse_1', name: 'get_weather' } },
    }),
    event('contentBlockDelta', { contentBlockIndex: 1, delta: { toolUse: { input: '{"city":' } } }),
    event('contentBlockDelta', { contentBlockIndex: 1, delta: { toolUse: { input: '"Vienna"}' } } }),
    event('contentBlockStop', { contentBlockIndex: 1 }),
    event('messageStop', { stopReason: 'tool_use' }),
    event('metadata', { usage: { inputTokens: 12, outputTokens: 8, totalTokens: 20 }, metrics: { latencyMs: 100 } }),
  ]);

  const response = await createClient().send(
    new ConverseStreamCommand({
      modelId,
      system: [{ text: 'You are a helpful assistant.' }],
      messages: [{ role: 'user', content: [{ text: 'Hello' }] }],
    }),
  );

  let text = '';
  for await (const item of response.stream) {
    text += item.contentBlockDelta?.delta?.text ?? '';
  }
  if (text !== 'Hello from Bedrock') {
    throw new Error(`Unexpected streamed text: ${text}`);
  }
}

async function invokeModelWithResponseStream() {
  mockStream(/\/model\/.*\/invoke-with-response-stream$/, [
    invokeModelChunk({
      type: 'message_start',
      message: { id: 'msg_bdrk_2', model: 'claude-3-5-sonnet-20240620', usage: { input_tokens: 15, output_tokens: 1 } },
    }),
    invokeModelChunk({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
    invokeModelChunk({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Streamed ' } }),
    invokeModelChunk({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'reply' } }),
    invokeModelChunk({ type: 'content_block_stop', index: 0 }),
    invokeModelChunk({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 9 } }),
    invokeModelChunk({ type: 'message_stop' }),
  ]);

  const response = await createClient().send(
    new InvokeModelWithResponseStreamCommand({
      modelId,
      contentType: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'Stream please' }],
      }),
    }),
  );

  let chunks = 0;
  for await (const item of response.body) {
    if (item.chunk?.bytes) {
      chunks++;
    }
  }
  if (chunks !== 7) {
    throw new Error(`Unexpected chunk count: ${chunks}`);
  }
}

async function failingConverseStream() {
  mockStream(/\/model\/.*\/converse-stream$/, [
    event('messageStart', { role: 'assistant' }),
    event('contentBlockDelta', { contentBlockIndex: 0, delta: { text: 'Partial' } }),
    exception('modelStreamErrorException', { message: 'The model stream failed', originalStatusCode: 500 }),
  ]);

  const response = await createClient().send(
    new ConverseStreamCommand({
      modelId: 'amazon.nova-pro-v1:0',
      messages: [{ role: 'user', content: [{ text: 'Fail please' }] }],
    }),
  );

  try {
    for await (const _ of response.stream) {
      // drain
    }
  } catch (error) {
    if (error.name !== 'ModelStreamErrorException') {
      throw error;
    }
    return;
  }
  throw new Error('Expected the stream to fail');
}

async function abortedConverseStream() {
  mockStream(/\/model\/.*\/converse-stream$/, [
    event('messageStart', { role: 'assistant' }),
    event('contentBlockDelta', { contentBlockIndex: 0, delta: { text: 'Partial' } }),
    exception('modelStreamErrorException', { message: 'The model stream failed', originalStatusCode: 500 }),
  ]);

  const controller = new AbortController();
  const response = await createClient().send(
    new ConverseStreamCommand({
      modelId: 'amazon.nova-lite-v1:0',
      messages: [{ role: 'user', content: [{ text: 'Stop please' }] }],
    }),
    { abortSignal: controller.signal },
  );

  try {
    for await (const _ of response.stream) {
      controller.abort();
    }
  } catch {
    return;
  }
  throw new Error('Expected the stream to fail');
}

async function run() {
  await Sentry.startSpan({ name: 'Test Transaction' }, async () => {
    await converseStream();
    await invokeModelWithResponseStream();
    await failingConverseStream();
    await abortedConverseStream();
  });
}

run();
