import type { Span } from '@sentry/core';
import { setCurrentClient, spanToJSON, startInactiveSpan } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BedrockRuntimeServiceExtension } from '../../src/integrations/aws-sdk/services/bedrock-runtime';
import type { NormalizedResponse } from '../../src/integrations/aws-sdk/types';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';

const CLAUDE_MODEL_ID = 'anthropic.claude-3-5-sonnet-20240620-v1:0';

const STREAM_COMMANDS = [
  { commandName: 'ConverseStream', streamField: 'stream' },
  { commandName: 'InvokeModelWithResponseStream', streamField: 'body' },
];

function respond(span: Span, commandName: string, commandInput: Record<string, unknown>, data: unknown): void {
  const response: NormalizedResponse = {
    data,
    request: { serviceName: 'BedrockRuntime', commandName, commandInput },
    requestId: 'b0a5e5a2-2c2b-4f56-9d0e-8c7c2d3f4a10',
  };
  new BedrockRuntimeServiceExtension().responseHook(response, span);
}

async function drain(stream: AsyncIterable<unknown>): Promise<void> {
  for await (const _ of stream) {
    // consume
  }
}

describe('BedrockRuntimeServiceExtension stream spans', () => {
  beforeEach(() => {
    const client = new TestClient(getDefaultTestClientOptions({ tracesSampleRate: 1 }));
    setCurrentClient(client);
    client.init();
  });

  afterEach(() => {
    setCurrentClient(undefined as never);
  });

  it.each(STREAM_COMMANDS)(
    'marks a $commandName span as failed when the stream fails',
    async ({ commandName, streamField }) => {
      const span = startInactiveSpan({ name: 'bedrock' });
      const error = new Error('ThrottlingException: Too many tokens, please wait before trying again.');
      const data: Record<string, unknown> = {
        [streamField]: (async function* () {
          yield { messageStart: { role: 'assistant' } };
          throw error;
        })(),
      };

      respond(span, commandName, { modelId: CLAUDE_MODEL_ID }, data);

      await expect(drain(data[streamField] as AsyncIterable<unknown>)).rejects.toBe(error);
      expect(spanToJSON(span).status).toBe('error');
      expect(spanToJSON(span).end_timestamp).toBeDefined();
    },
  );

  it.each(STREAM_COMMANDS)('ends a $commandName span when the response has no stream', ({ commandName }) => {
    const span = startInactiveSpan({ name: 'bedrock' });

    respond(span, commandName, { modelId: CLAUDE_MODEL_ID }, {});

    expect(spanToJSON(span).end_timestamp).toBeDefined();
  });

  it('ends an InvokeModelWithResponseStream span without a modelId when the stream is drained', async () => {
    const span = startInactiveSpan({ name: 'bedrock' });
    const data = { body: (async function* () {})() };

    respond(span, 'InvokeModelWithResponseStream', {}, data);
    await drain(data.body);

    expect(spanToJSON(span).end_timestamp).toBeDefined();
  });
});
