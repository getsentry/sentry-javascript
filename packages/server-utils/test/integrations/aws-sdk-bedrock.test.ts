import {
  GEN_AI_OPERATION_NAME,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MAX_TOKENS,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_REQUEST_TEMPERATURE,
} from '@sentry/conventions/attributes';
import { GEN_AI_GENERATE_CONTENT } from '@sentry/conventions/op';
import { describe, expect, it } from 'vitest';
import { BedrockRuntimeServiceExtension } from '../../src/integrations/aws-sdk/services/bedrock-runtime';
import type { RequestMetadata } from '../../src/integrations/aws-sdk/types';

const CLAUDE_MODEL_ID = 'anthropic.claude-3-5-sonnet-20240620-v1:0';

const CLAUDE_REQUEST_BODY = {
  anthropic_version: 'bedrock-2023-05-31',
  max_tokens: 1024,
  temperature: 0.5,
  messages: [{ role: 'user', content: 'What is the capital of France?' }],
};

function invokeModelPreSpanHook(commandInput: Record<string, unknown>): RequestMetadata {
  return new BedrockRuntimeServiceExtension().requestPreSpanHook({
    serviceName: 'BedrockRuntime',
    commandName: 'InvokeModel',
    commandInput,
  });
}

describe('BedrockRuntimeServiceExtension InvokeModel request', () => {
  it('reads a request body passed as bytes', () => {
    const body = new TextEncoder().encode(JSON.stringify(CLAUDE_REQUEST_BODY));

    const { spanAttributes } = invokeModelPreSpanHook({ modelId: CLAUDE_MODEL_ID, body });

    expect(spanAttributes).toEqual({
      [GEN_AI_PROVIDER_NAME]: 'aws.bedrock',
      [GEN_AI_OPERATION_NAME]: 'generate_content',
      [GEN_AI_REQUEST_MODEL]: CLAUDE_MODEL_ID,
      [GEN_AI_REQUEST_MAX_TOKENS]: 1024,
      [GEN_AI_REQUEST_TEMPERATURE]: 0.5,
    });
  });

  it('keeps the span when the request body is not JSON', () => {
    const metadata = invokeModelPreSpanHook({ modelId: CLAUDE_MODEL_ID, body: 'Human: Hello\n\nAssistant:' });

    expect(metadata).toEqual({
      spanName: `generate_content ${CLAUDE_MODEL_ID}`,
      spanOp: GEN_AI_GENERATE_CONTENT,
      isStream: false,
      spanAttributes: {
        [GEN_AI_PROVIDER_NAME]: 'aws.bedrock',
        [GEN_AI_OPERATION_NAME]: 'generate_content',
        [GEN_AI_REQUEST_MODEL]: CLAUDE_MODEL_ID,
      },
    });
  });

  it('keeps the span when the modelId is missing', () => {
    const metadata = invokeModelPreSpanHook({ body: JSON.stringify(CLAUDE_REQUEST_BODY) });

    expect(metadata).toEqual({
      spanName: 'generate_content',
      spanOp: GEN_AI_GENERATE_CONTENT,
      isStream: false,
      spanAttributes: {
        [GEN_AI_PROVIDER_NAME]: 'aws.bedrock',
        [GEN_AI_OPERATION_NAME]: 'generate_content',
      },
    });
  });
});
