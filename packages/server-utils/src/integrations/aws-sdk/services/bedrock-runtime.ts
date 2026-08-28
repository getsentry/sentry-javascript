import type { Span } from '@sentry/core';
import { debug } from '@sentry/core';
import {
  GEN_AI_OPERATION_NAME,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MAX_TOKENS,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_REQUEST_STOP_SEQUENCES as ATTR_GEN_AI_REQUEST_STOP_SEQUENCES,
  GEN_AI_REQUEST_TEMPERATURE,
  GEN_AI_REQUEST_TOP_P,
  GEN_AI_RESPONSE_FINISH_REASONS,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
} from '@sentry/conventions/attributes';
import { DEBUG_BUILD } from '../../../debug-build';
import {
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
  GEN_AI_OPERATION_NAME_VALUE_GENERATE_CONTENT,
  GEN_AI_SYSTEM_VALUE_AWS_BEDROCK,
} from '../constants';
import type { NormalizedRequest, NormalizedResponse } from '../types';
import type { RequestMetadata, ServiceExtension } from './ServiceExtension';

// Simplified types inlined from @aws-sdk/client-bedrock-runtime
// Only the fields accessed by this instrumentation are included
interface TokenUsage {
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  totalTokens: number | undefined;
}

interface ConverseStreamOutput {
  messageStop?: { stopReason?: string };
  metadata?: { usage?: TokenUsage };
  [key: string]: unknown;
}

// Streamed `InvokeModel` chunks and response bodies are model-family-specific JSON (titan, nova,
// claude, llama, cohere, mistral); the record helpers probe the shapes defensively, so `any` instead
// of one structural type per family.
type ParsedChunk = any;

const textDecoder = new TextDecoder();

export class BedrockRuntimeServiceExtension implements ServiceExtension {
  public requestPreSpanHook(request: NormalizedRequest): RequestMetadata {
    switch (request.commandName) {
      case 'Converse':
        return this._requestPreSpanHookConverse(request, false);
      case 'ConverseStream':
        return this._requestPreSpanHookConverse(request, true);
      case 'InvokeModel':
        return this._requestPreSpanHookInvokeModel(request, false);
      case 'InvokeModelWithResponseStream':
        return this._requestPreSpanHookInvokeModel(request, true);
    }

    return {};
  }

  public responseHook(response: NormalizedResponse, span: Span): void {
    const commandName = response.request.commandName;

    if (!span.isRecording()) {
      // Streaming spans are ended by the wrapped stream (the subscriber's `deferSpanEnd` suppresses
      // the helper's own `end()`). When the span isn't recording we skip wrapping, so end it here to
      // avoid leaking an open span. Non-streaming commands are ended by the helper, so leave them.
      if (commandName === 'ConverseStream' || commandName === 'InvokeModelWithResponseStream') {
        span.end();
      }
      return;
    }

    switch (commandName) {
      case 'Converse':
        return this._responseHookConverse(response, span);
      case 'ConverseStream':
        return this._responseHookConverseStream(response, span);
      case 'InvokeModel':
        return this._responseHookInvokeModel(response, span);
      case 'InvokeModelWithResponseStream':
        return this._responseHookInvokeModelWithResponseStream(response, span);
    }
  }

  private _requestPreSpanHookConverse(request: NormalizedRequest, isStream: boolean): RequestMetadata {
    let spanName = GEN_AI_OPERATION_NAME_VALUE_CHAT;
    const spanAttributes: Record<string, unknown> = {
      [GEN_AI_PROVIDER_NAME]: GEN_AI_SYSTEM_VALUE_AWS_BEDROCK,
      [GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
    };

    const modelId = request.commandInput.modelId;
    if (modelId) {
      spanAttributes[GEN_AI_REQUEST_MODEL] = modelId;
      if (spanName) {
        spanName += ` ${modelId}`;
      }
    }

    const inferenceConfig = request.commandInput.inferenceConfig;
    if (inferenceConfig) {
      const { maxTokens, temperature, topP, stopSequences } = inferenceConfig;
      if (maxTokens !== undefined) {
        spanAttributes[GEN_AI_REQUEST_MAX_TOKENS] = maxTokens;
      }
      if (temperature !== undefined) {
        spanAttributes[GEN_AI_REQUEST_TEMPERATURE] = temperature;
      }
      if (topP !== undefined) {
        spanAttributes[GEN_AI_REQUEST_TOP_P] = topP;
      }
      if (stopSequences !== undefined) {
        spanAttributes[ATTR_GEN_AI_REQUEST_STOP_SEQUENCES] = stopSequences;
      }
    }

    return {
      spanName,
      spanOp: 'gen_ai.chat',
      isStream,
      spanAttributes,
    };
  }

  private _requestPreSpanHookInvokeModel(request: NormalizedRequest, isStream: boolean): RequestMetadata {
    let spanName = GEN_AI_OPERATION_NAME_VALUE_GENERATE_CONTENT;
    const spanAttributes: Record<string, unknown> = {
      [GEN_AI_PROVIDER_NAME]: GEN_AI_SYSTEM_VALUE_AWS_BEDROCK,
      [GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_GENERATE_CONTENT,
    };

    const modelId = request.commandInput?.modelId;
    if (modelId) {
      spanAttributes[GEN_AI_REQUEST_MODEL] = modelId;
      spanName += ` ${modelId}`;
    }

    if (request.commandInput?.body) {
      const requestBody = JSON.parse(request.commandInput.body);
      if (modelId.includes('amazon.titan')) {
        if (requestBody.textGenerationConfig?.temperature !== undefined) {
          spanAttributes[GEN_AI_REQUEST_TEMPERATURE] = requestBody.textGenerationConfig.temperature;
        }
        if (requestBody.textGenerationConfig?.topP !== undefined) {
          spanAttributes[GEN_AI_REQUEST_TOP_P] = requestBody.textGenerationConfig.topP;
        }
        if (requestBody.textGenerationConfig?.maxTokenCount !== undefined) {
          spanAttributes[GEN_AI_REQUEST_MAX_TOKENS] = requestBody.textGenerationConfig.maxTokenCount;
        }
        if (requestBody.textGenerationConfig?.stopSequences !== undefined) {
          spanAttributes[ATTR_GEN_AI_REQUEST_STOP_SEQUENCES] = requestBody.textGenerationConfig.stopSequences;
        }
      } else if (modelId.includes('amazon.nova')) {
        if (requestBody.inferenceConfig?.temperature !== undefined) {
          spanAttributes[GEN_AI_REQUEST_TEMPERATURE] = requestBody.inferenceConfig.temperature;
        }
        if (requestBody.inferenceConfig?.top_p !== undefined) {
          spanAttributes[GEN_AI_REQUEST_TOP_P] = requestBody.inferenceConfig.top_p;
        }
        if (requestBody.inferenceConfig?.max_new_tokens !== undefined) {
          spanAttributes[GEN_AI_REQUEST_MAX_TOKENS] = requestBody.inferenceConfig.max_new_tokens;
        }
        if (requestBody.inferenceConfig?.stopSequences !== undefined) {
          spanAttributes[ATTR_GEN_AI_REQUEST_STOP_SEQUENCES] = requestBody.inferenceConfig.stopSequences;
        }
      } else if (modelId.includes('anthropic.claude')) {
        if (requestBody.max_tokens !== undefined) {
          spanAttributes[GEN_AI_REQUEST_MAX_TOKENS] = requestBody.max_tokens;
        }
        if (requestBody.temperature !== undefined) {
          spanAttributes[GEN_AI_REQUEST_TEMPERATURE] = requestBody.temperature;
        }
        if (requestBody.top_p !== undefined) {
          spanAttributes[GEN_AI_REQUEST_TOP_P] = requestBody.top_p;
        }
        if (requestBody.stop_sequences !== undefined) {
          spanAttributes[ATTR_GEN_AI_REQUEST_STOP_SEQUENCES] = requestBody.stop_sequences;
        }
      } else if (modelId.includes('meta.llama')) {
        if (requestBody.max_gen_len !== undefined) {
          spanAttributes[GEN_AI_REQUEST_MAX_TOKENS] = requestBody.max_gen_len;
        }
        if (requestBody.temperature !== undefined) {
          spanAttributes[GEN_AI_REQUEST_TEMPERATURE] = requestBody.temperature;
        }
        if (requestBody.top_p !== undefined) {
          spanAttributes[GEN_AI_REQUEST_TOP_P] = requestBody.top_p;
        }
        // request for meta llama models does not contain stop_sequences field
      } else if (modelId.includes('cohere.command-r')) {
        if (requestBody.max_tokens !== undefined) {
          spanAttributes[GEN_AI_REQUEST_MAX_TOKENS] = requestBody.max_tokens;
        }
        if (requestBody.temperature !== undefined) {
          spanAttributes[GEN_AI_REQUEST_TEMPERATURE] = requestBody.temperature;
        }
        if (requestBody.p !== undefined) {
          spanAttributes[GEN_AI_REQUEST_TOP_P] = requestBody.p;
        }
        if (requestBody.message !== undefined) {
          // NOTE: We approximate the token count since this value is not directly available in the body.
          // According to Bedrock docs they use (total_chars / 6) to approximate token count for pricing.
          spanAttributes[GEN_AI_USAGE_INPUT_TOKENS] = Math.ceil(requestBody.message.length / 6);
        }
        if (requestBody.stop_sequences !== undefined) {
          spanAttributes[ATTR_GEN_AI_REQUEST_STOP_SEQUENCES] = requestBody.stop_sequences;
        }
      } else if (modelId.includes('cohere.command')) {
        if (requestBody.max_tokens !== undefined) {
          spanAttributes[GEN_AI_REQUEST_MAX_TOKENS] = requestBody.max_tokens;
        }
        if (requestBody.temperature !== undefined) {
          spanAttributes[GEN_AI_REQUEST_TEMPERATURE] = requestBody.temperature;
        }
        if (requestBody.p !== undefined) {
          spanAttributes[GEN_AI_REQUEST_TOP_P] = requestBody.p;
        }
        if (requestBody.prompt !== undefined) {
          spanAttributes[GEN_AI_USAGE_INPUT_TOKENS] = Math.ceil(requestBody.prompt.length / 6);
        }
        if (requestBody.stop_sequences !== undefined) {
          spanAttributes[ATTR_GEN_AI_REQUEST_STOP_SEQUENCES] = requestBody.stop_sequences;
        }
      } else if (modelId.includes('mistral')) {
        if (requestBody.prompt !== undefined) {
          spanAttributes[GEN_AI_USAGE_INPUT_TOKENS] = Math.ceil(requestBody.prompt.length / 6);
        }
        if (requestBody.max_tokens !== undefined) {
          spanAttributes[GEN_AI_REQUEST_MAX_TOKENS] = requestBody.max_tokens;
        }
        if (requestBody.temperature !== undefined) {
          spanAttributes[GEN_AI_REQUEST_TEMPERATURE] = requestBody.temperature;
        }
        if (requestBody.top_p !== undefined) {
          spanAttributes[GEN_AI_REQUEST_TOP_P] = requestBody.top_p;
        }
        if (requestBody.stop !== undefined) {
          spanAttributes[ATTR_GEN_AI_REQUEST_STOP_SEQUENCES] = requestBody.stop;
        }
      }
    }

    return {
      spanName,
      spanOp: 'gen_ai.generate_content',
      isStream,
      spanAttributes,
    };
  }

  private _responseHookConverse(response: NormalizedResponse, span: Span): void {
    const { stopReason, usage } = response.data;

    setStopReason(span, stopReason);
    setUsage(span, usage);
  }

  private _responseHookConverseStream(response: NormalizedResponse, span: Span): void {
    // Wrap and replace the response stream in place to process events into telemetry
    // before yielding to the user.
    response.data.stream = wrapConverseStreamResponse(response.data.stream, span);
  }

  private _responseHookInvokeModel(response: NormalizedResponse, span: Span): void {
    const currentModelId = response.request.commandInput?.modelId;
    if (response.data?.body) {
      const decodedResponseBody = textDecoder.decode(response.data.body);
      const responseBody = JSON.parse(decodedResponseBody);
      if (currentModelId.includes('amazon.titan')) {
        if (responseBody.inputTextTokenCount !== undefined) {
          span.setAttribute(GEN_AI_USAGE_INPUT_TOKENS, responseBody.inputTextTokenCount);
        }
        if (responseBody.results?.[0]?.tokenCount !== undefined) {
          span.setAttribute(GEN_AI_USAGE_OUTPUT_TOKENS, responseBody.results[0].tokenCount);
        }
        if (responseBody.results?.[0]?.completionReason !== undefined) {
          span.setAttribute(GEN_AI_RESPONSE_FINISH_REASONS, [responseBody.results[0].completionReason]);
        }
      } else if (currentModelId.includes('amazon.nova')) {
        if (responseBody.usage !== undefined) {
          if (responseBody.usage.inputTokens !== undefined) {
            span.setAttribute(GEN_AI_USAGE_INPUT_TOKENS, responseBody.usage.inputTokens);
          }
          if (responseBody.usage.outputTokens !== undefined) {
            span.setAttribute(GEN_AI_USAGE_OUTPUT_TOKENS, responseBody.usage.outputTokens);
          }
        }
        if (responseBody.stopReason !== undefined) {
          span.setAttribute(GEN_AI_RESPONSE_FINISH_REASONS, [responseBody.stopReason]);
        }
      } else if (currentModelId.includes('anthropic.claude')) {
        if (responseBody.usage?.input_tokens !== undefined) {
          span.setAttribute(GEN_AI_USAGE_INPUT_TOKENS, responseBody.usage.input_tokens);
        }
        if (responseBody.usage?.output_tokens !== undefined) {
          span.setAttribute(GEN_AI_USAGE_OUTPUT_TOKENS, responseBody.usage.output_tokens);
        }
        if (responseBody.stop_reason !== undefined) {
          span.setAttribute(GEN_AI_RESPONSE_FINISH_REASONS, [responseBody.stop_reason]);
        }
      } else if (currentModelId.includes('meta.llama')) {
        if (responseBody.prompt_token_count !== undefined) {
          span.setAttribute(GEN_AI_USAGE_INPUT_TOKENS, responseBody.prompt_token_count);
        }
        if (responseBody.generation_token_count !== undefined) {
          span.setAttribute(GEN_AI_USAGE_OUTPUT_TOKENS, responseBody.generation_token_count);
        }
        if (responseBody.stop_reason !== undefined) {
          span.setAttribute(GEN_AI_RESPONSE_FINISH_REASONS, [responseBody.stop_reason]);
        }
      } else if (currentModelId.includes('cohere.command-r')) {
        if (responseBody.text !== undefined) {
          span.setAttribute(GEN_AI_USAGE_OUTPUT_TOKENS, Math.ceil(responseBody.text.length / 6));
        }
        if (responseBody.finish_reason !== undefined) {
          span.setAttribute(GEN_AI_RESPONSE_FINISH_REASONS, [responseBody.finish_reason]);
        }
      } else if (currentModelId.includes('cohere.command')) {
        if (responseBody.generations?.[0]?.text !== undefined) {
          span.setAttribute(GEN_AI_USAGE_OUTPUT_TOKENS, Math.ceil(responseBody.generations[0].text.length / 6));
        }
        if (responseBody.generations?.[0]?.finish_reason !== undefined) {
          span.setAttribute(GEN_AI_RESPONSE_FINISH_REASONS, [responseBody.generations[0].finish_reason]);
        }
      } else if (currentModelId.includes('mistral')) {
        if (responseBody.outputs?.[0]?.text !== undefined) {
          span.setAttribute(GEN_AI_USAGE_OUTPUT_TOKENS, Math.ceil(responseBody.outputs[0].text.length / 6));
        }
        if (responseBody.outputs?.[0]?.stop_reason !== undefined) {
          span.setAttribute(GEN_AI_RESPONSE_FINISH_REASONS, [responseBody.outputs[0].stop_reason]);
        }
      }
    }
  }

  private _responseHookInvokeModelWithResponseStream(response: NormalizedResponse, span: Span): void {
    const stream = response.data?.body;
    const modelId = response.request.commandInput?.modelId;
    if (!stream || !modelId) {
      return;
    }

    // Resolved once: the model family is fixed for the whole stream, and for unrecognized families
    // the chunks don't need to be parsed at all.
    const recordAttributes = resolveStreamRecorder(modelId);

    // Replace the original response body with our instrumented stream, deferring span.end() until the
    // entire stream is consumed. Downstream consumers still receive the full stream.
    response.data.body = (async function* () {
      try {
        for await (const chunk of stream) {
          if (recordAttributes) {
            const parsedChunk = parseChunk(chunk?.chunk?.bytes);
            if (parsedChunk) {
              recordAttributes(parsedChunk, span);
            }
          }
          yield chunk;
        }
      } finally {
        span.end();
      }
    })();
  }
}

function resolveStreamRecorder(modelId: string): ((parsedChunk: ParsedChunk, span: Span) => void) | undefined {
  if (modelId.includes('amazon.titan')) return recordTitanAttributes;
  if (modelId.includes('anthropic.claude')) return recordClaudeAttributes;
  if (modelId.includes('amazon.nova')) return recordNovaAttributes;
  if (modelId.includes('meta.llama')) return recordLlamaAttributes;
  if (modelId.includes('cohere.command-r')) return recordCohereRAttributes;
  if (modelId.includes('cohere.command')) return recordCohereAttributes;
  if (modelId.includes('mistral')) return recordMistralAttributes;
  return undefined;
}

async function* wrapConverseStreamResponse(
  stream: AsyncIterable<ConverseStreamOutput>,
  span: Span,
): AsyncGenerator<ConverseStreamOutput> {
  try {
    let usage: TokenUsage | undefined;
    for await (const item of stream) {
      setStopReason(span, item.messageStop?.stopReason);
      usage = item.metadata?.usage;
      yield item;
    }
    setUsage(span, usage);
  } finally {
    span.end();
  }
}

function setStopReason(span: Span, stopReason: string | undefined): void {
  if (stopReason !== undefined) {
    span.setAttribute(GEN_AI_RESPONSE_FINISH_REASONS, [stopReason]);
  }
}

function setUsage(span: Span, usage: TokenUsage | undefined): void {
  if (usage) {
    const { inputTokens, outputTokens } = usage;
    if (inputTokens !== undefined) {
      span.setAttribute(GEN_AI_USAGE_INPUT_TOKENS, inputTokens);
    }
    if (outputTokens !== undefined) {
      span.setAttribute(GEN_AI_USAGE_OUTPUT_TOKENS, outputTokens);
    }
  }
}

function parseChunk(bytes?: Uint8Array): ParsedChunk {
  if (!bytes || !(bytes instanceof Uint8Array)) {
    return null;
  }
  try {
    const str = Buffer.from(bytes).toString('utf-8');
    return JSON.parse(str);
  } catch (err) {
    DEBUG_BUILD && debug.warn('[instrumentation:aws-sdk] failed to parse streamed bedrock chunk', err);
    return null;
  }
}

function recordNovaAttributes(parsedChunk: ParsedChunk, span: Span): void {
  if (parsedChunk.metadata?.usage !== undefined) {
    if (parsedChunk.metadata?.usage.inputTokens !== undefined) {
      span.setAttribute(GEN_AI_USAGE_INPUT_TOKENS, parsedChunk.metadata.usage.inputTokens);
    }
    if (parsedChunk.metadata?.usage.outputTokens !== undefined) {
      span.setAttribute(GEN_AI_USAGE_OUTPUT_TOKENS, parsedChunk.metadata.usage.outputTokens);
    }
  }
  if (parsedChunk.messageStop?.stopReason !== undefined) {
    span.setAttribute(GEN_AI_RESPONSE_FINISH_REASONS, [parsedChunk.messageStop.stopReason]);
  }
}

function recordClaudeAttributes(parsedChunk: ParsedChunk, span: Span): void {
  if (parsedChunk.message?.usage?.input_tokens !== undefined) {
    span.setAttribute(GEN_AI_USAGE_INPUT_TOKENS, parsedChunk.message.usage.input_tokens);
  }
  if (parsedChunk.message?.usage?.output_tokens !== undefined) {
    span.setAttribute(GEN_AI_USAGE_OUTPUT_TOKENS, parsedChunk.message.usage.output_tokens);
  }
  if (parsedChunk.delta?.stop_reason !== undefined) {
    span.setAttribute(GEN_AI_RESPONSE_FINISH_REASONS, [parsedChunk.delta.stop_reason]);
  }
}

function recordTitanAttributes(parsedChunk: ParsedChunk, span: Span): void {
  if (parsedChunk.inputTextTokenCount !== undefined) {
    span.setAttribute(GEN_AI_USAGE_INPUT_TOKENS, parsedChunk.inputTextTokenCount);
  }
  if (parsedChunk.totalOutputTextTokenCount !== undefined) {
    span.setAttribute(GEN_AI_USAGE_OUTPUT_TOKENS, parsedChunk.totalOutputTextTokenCount);
  }
  if (parsedChunk.completionReason !== undefined) {
    span.setAttribute(GEN_AI_RESPONSE_FINISH_REASONS, [parsedChunk.completionReason]);
  }
}

function recordLlamaAttributes(parsedChunk: ParsedChunk, span: Span): void {
  if (parsedChunk.prompt_token_count !== undefined) {
    span.setAttribute(GEN_AI_USAGE_INPUT_TOKENS, parsedChunk.prompt_token_count);
  }
  if (parsedChunk.generation_token_count !== undefined) {
    span.setAttribute(GEN_AI_USAGE_OUTPUT_TOKENS, parsedChunk.generation_token_count);
  }
  if (parsedChunk.stop_reason !== undefined) {
    span.setAttribute(GEN_AI_RESPONSE_FINISH_REASONS, [parsedChunk.stop_reason]);
  }
}

function recordMistralAttributes(parsedChunk: ParsedChunk, span: Span): void {
  if (parsedChunk.outputs?.[0]?.text !== undefined) {
    span.setAttribute(GEN_AI_USAGE_OUTPUT_TOKENS, Math.ceil(parsedChunk.outputs[0].text.length / 6));
  }
  if (parsedChunk.outputs?.[0]?.stop_reason !== undefined) {
    span.setAttribute(GEN_AI_RESPONSE_FINISH_REASONS, [parsedChunk.outputs[0].stop_reason]);
  }
}

function recordCohereAttributes(parsedChunk: ParsedChunk, span: Span): void {
  if (parsedChunk.generations?.[0]?.text !== undefined) {
    span.setAttribute(GEN_AI_USAGE_OUTPUT_TOKENS, Math.ceil(parsedChunk.generations[0].text.length / 6));
  }
  if (parsedChunk.generations?.[0]?.finish_reason !== undefined) {
    span.setAttribute(GEN_AI_RESPONSE_FINISH_REASONS, [parsedChunk.generations[0].finish_reason]);
  }
}

function recordCohereRAttributes(parsedChunk: ParsedChunk, span: Span): void {
  if (parsedChunk.text !== undefined) {
    span.setAttribute(GEN_AI_USAGE_OUTPUT_TOKENS, Math.ceil(parsedChunk.text.length / 6));
  }
  if (parsedChunk.finish_reason !== undefined) {
    span.setAttribute(GEN_AI_RESPONSE_FINISH_REASONS, [parsedChunk.finish_reason]);
  }
}
