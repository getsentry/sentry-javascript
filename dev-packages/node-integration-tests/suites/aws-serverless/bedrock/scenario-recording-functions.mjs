import * as Sentry from '@sentry/aws-serverless';
import { BedrockRuntimeClient, ConverseCommand, ConverseStreamCommand } from '@aws-sdk/client-bedrock-runtime';
// Force the HTTP/1 handler so `nock` can intercept the request instead of hitting real AWS.
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { EventStreamCodec } from '@smithy/core/event-streams';
import nock from 'nock';
import { Buffer } from 'node:buffer';

nock.disableNetConnect();

const region = 'us-east-1';
const credentials = { accessKeyId: 'aws-test-key', secretAccessKey: 'aws-test-secret' };
const host = `https://bedrock-runtime.${region}.amazonaws.com`;

// Bedrock streams responses in the binary AWS event stream format, not JSON. The SDK decodes and
// checks each message (headers, payload, CRC32), so the mocked response must use the same format.
// The SDK's own codec encodes the messages. It needs UTF-8 helpers to encode the header strings.
// https://docs.aws.amazon.com/AmazonS3/latest/API/RESTSelectObjectAppendix.html
const codec = new EventStreamCodec(
  bytes => Buffer.from(bytes).toString('utf8'),
  text => Buffer.from(text),
);

// The codec needs a type for each header value. All Bedrock headers are strings.
function encodeMessage(headers, payload) {
  return codec.encode({
    headers: Object.fromEntries(Object.entries(headers).map(([name, value]) => [name, { type: 'string', value }])),
    body: Buffer.from(JSON.stringify(payload)),
  });
}

// The SDK reads `:event-type` to find the stream member (for example `messageStart` or `chunk`).
function event(eventType, payload) {
  return encodeMessage(
    { ':message-type': 'event', ':event-type': eventType, ':content-type': 'application/json' },
    payload,
  );
}

function mockStream(path, messages) {
  nock(host).post(path).reply(200, Buffer.concat(messages), { 'content-type': 'application/vnd.amazon.eventstream' });
}

function createClient() {
  return new BedrockRuntimeClient({ region, credentials, maxAttempts: 1, requestHandler: new NodeHttpHandler() });
}

function converse(modelId, privacy) {
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

  return createClient().send(
    new ConverseCommand({
      modelId,
      messages: [{ role: 'user', content: [{ text: 'Hello' }] }],
      requestMetadata: { privacy },
    }),
  );
}

async function run() {
  await Sentry.startSpan({ name: 'Test Transaction' }, async () => {
    await Sentry.withScope(async scope => {
      scope.setTag('privacy', 'public');
      await converse('amazon.nova-pro-v1:0', 'public');
    });

    await Sentry.withScope(async scope => {
      scope.setTag('privacy', 'private');
      await converse('amazon.nova-lite-v1:0', 'private');

      mockStream(/\/model\/.*\/converse-stream$/, [
        event('messageStart', { role: 'assistant' }),
        event('contentBlockDelta', { contentBlockIndex: 0, delta: { text: 'Hello from Bedrock' } }),
        event('contentBlockStop', { contentBlockIndex: 0 }),
        event('messageStop', { stopReason: 'end_turn' }),
      ]);
      const pending = createClient().send(
        new ConverseStreamCommand({
          modelId: 'amazon.nova-micro-v1:0',
          messages: [{ role: 'user', content: [{ text: 'Hello' }] }],
          requestMetadata: { privacy: 'public' },
        }),
      );
      // Changing the tag after the call started must not change its outputs decision.
      Sentry.getCurrentScope().setTag('privacy', 'public');
      const response = await pending;
      for await (const _ of response.stream) {
        // drain
      }
    });
  });
}

run();
