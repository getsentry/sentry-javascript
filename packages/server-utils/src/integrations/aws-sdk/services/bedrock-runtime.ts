import type { Span } from '@sentry/core';
import { debug, SPAN_STATUS_ERROR } from '@sentry/core';
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
import { GEN_AI_CHAT, GEN_AI_GENERATE_CONTENT } from '@sentry/conventions/op';
import type { StreamResponseState } from '../../../ai/core/utils';
import { endStreamSpan, getTokenUsageAttributes, resolveAIRecordingOptions } from '../../../ai/core/utils';
import { DEBUG_BUILD } from '../../../debug-build';
import {
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
  GEN_AI_OPERATION_NAME_VALUE_GENERATE_CONTENT,
  GEN_AI_SYSTEM_VALUE_AWS_BEDROCK,
} from '../constants';
import type { NormalizedRequest, NormalizedResponse } from '../types';
import {
  getClaudeInputAttributes,
  getConverseInputAttributes,
  getPromptInputAttributes,
} from './bedrock-runtime-content';
import type { RequestMetadata, ServiceExtension } from './ServiceExtension';

// Simplified types inlined from @aws-sdk/client-bedrock-runtime
// Only the fields accessed by this instrumentation are included
interface TokenUsage {
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  totalTokens: number | undefined;
  cacheReadInputTokens?: number;
  cacheWriteInputTokens?: number;
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

    if (resolveAIRecordingOptions().recordInputs) {
      Object.assign(spanAttributes, getConverseInputAttributes(request.commandInput));
    }

    return {
      spanName,
      spanOp: GEN_AI_CHAT,
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

    const requestBody = parseRequestBody(request.commandInput?.body);
    if (requestBody && typeof modelId === 'string') {
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

      if (resolveAIRecordingOptions().recordInputs) {
        Object.assign(spanAttributes, getInvokeModelInputAttributes(modelId, requestBody));
      }
    }

    return {
      spanName,
      spanOp: GEN_AI_GENERATE_CONTENT,
      isStream,
      spanAttributes,
    };
  }

  private _responseHookConverse(response: NormalizedResponse, span: Span): void {
    const { stopReason, usage } = response.data;

    setStopReason(span, stopReason);
    span.setAttributes(
      getTokenUsageAttributes(
        // With prompt caching, `inputTokens` leaves out cache reads and writes, which the conventions count as input.
        typeof usage?.inputTokens === 'number'
          ? usage.inputTokens + (usage.cacheReadInputTokens ?? 0) + (usage.cacheWriteInputTokens ?? 0)
          : undefined,
        usage?.outputTokens,
        usage?.cacheWriteInputTokens,
        usage?.cacheReadInputTokens,
      ),
    );
  }

  private _responseHookConverseStream(response: NormalizedResponse, span: Span): void {
    if (!response.data?.stream) {
      span.end();
      return;
    }

    // Wrap and replace the response stream in place to process events into telemetry
    // before yielding to the user.
    response.data.stream = instrumentStream(
      response.data.stream as AsyncIterable<ConverseStreamOutput>,
      span,
      response.request.abortSignal,
      processConverseStreamEvent,
    );
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
          span.setAttribute(GEN_AI_RESPONSE_FINISH_REASONS, JSON.stringify([responseBody.results[0].completionReason]));
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
          span.setAttribute(GEN_AI_RESPONSE_FINISH_REASONS, JSON.stringify([responseBody.stopReason]));
        }
      } else if (currentModelId.includes('anthropic.claude')) {
        const usage = responseBody.usage;
        span.setAttributes(
          getTokenUsageAttributes(
            // Anthropic's `input_tokens` leaves out cache reads and writes, which the conventions count as input.
            typeof usage?.input_tokens === 'number'
              ? usage.input_tokens + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0)
              : undefined,
            usage?.output_tokens,
            usage?.cache_creation_input_tokens,
            usage?.cache_read_input_tokens,
          ),
        );
        if (responseBody.stop_reason !== undefined) {
          span.setAttribute(GEN_AI_RESPONSE_FINISH_REASONS, JSON.stringify([responseBody.stop_reason]));
        }
      } else if (currentModelId.includes('meta.llama')) {
        if (responseBody.prompt_token_count !== undefined) {
          span.setAttribute(GEN_AI_USAGE_INPUT_TOKENS, responseBody.prompt_token_count);
        }
        if (responseBody.generation_token_count !== undefined) {
          span.setAttribute(GEN_AI_USAGE_OUTPUT_TOKENS, responseBody.generation_token_count);
        }
        if (responseBody.stop_reason !== undefined) {
          span.setAttribute(GEN_AI_RESPONSE_FINISH_REASONS, JSON.stringify([responseBody.stop_reason]));
        }
      } else if (currentModelId.includes('cohere.command-r')) {
        if (responseBody.text !== undefined) {
          span.setAttribute(GEN_AI_USAGE_OUTPUT_TOKENS, Math.ceil(responseBody.text.length / 6));
        }
        if (responseBody.finish_reason !== undefined) {
          span.setAttribute(GEN_AI_RESPONSE_FINISH_REASONS, JSON.stringify([responseBody.finish_reason]));
        }
      } else if (currentModelId.includes('cohere.command')) {
        if (responseBody.generations?.[0]?.text !== undefined) {
          span.setAttribute(GEN_AI_USAGE_OUTPUT_TOKENS, Math.ceil(responseBody.generations[0].text.length / 6));
        }
        if (responseBody.generations?.[0]?.finish_reason !== undefined) {
          span.setAttribute(
            GEN_AI_RESPONSE_FINISH_REASONS,
            JSON.stringify([responseBody.generations[0].finish_reason]),
          );
        }
      } else if (currentModelId.includes('mistral')) {
        if (responseBody.outputs?.[0]?.text !== undefined) {
          span.setAttribute(GEN_AI_USAGE_OUTPUT_TOKENS, Math.ceil(responseBody.outputs[0].text.length / 6));
        }
        if (responseBody.outputs?.[0]?.stop_reason !== undefined) {
          span.setAttribute(GEN_AI_RESPONSE_FINISH_REASONS, JSON.stringify([responseBody.outputs[0].stop_reason]));
        }
      }
    }
  }

  private _responseHookInvokeModelWithResponseStream(response: NormalizedResponse, span: Span): void {
    const stream = response.data?.body;
    const modelId = response.request.commandInput?.modelId;
    if (!stream) {
      span.end();
      return;
    }

    // Resolved once: the model family is fixed for the whole stream, and for unrecognized families
    // the chunks don't need to be parsed at all.
    const processChunk = typeof modelId === 'string' ? resolveStreamProcessor(modelId) : undefined;

    // Replace the original response body with our instrumented stream, deferring span.end() until the
    // entire stream is consumed. Downstream consumers still receive the full stream.
    response.data.body = instrumentStream(
      stream as AsyncIterable<{ chunk?: { bytes?: Uint8Array } }>,
      span,
      response.request.abortSignal,
      (item, state) => {
        if (processChunk) {
          const parsedChunk = parseChunk(item?.chunk?.bytes);
          if (parsedChunk) {
            processChunk(parsedChunk, state);
          }
        }
      },
    );
  }
}

function getInvokeModelInputAttributes(modelId: string, requestBody: ParsedChunk): Record<string, unknown> {
  if (modelId.includes('amazon.titan')) return getPromptInputAttributes(requestBody.inputText);
  if (modelId.includes('amazon.nova')) return getConverseInputAttributes(requestBody);
  if (modelId.includes('anthropic.claude')) return getClaudeInputAttributes(requestBody);
  if (modelId.includes('meta.llama')) return getPromptInputAttributes(requestBody.prompt);
  if (modelId.includes('cohere.command-r')) return getPromptInputAttributes(requestBody.message);
  if (modelId.includes('cohere.command')) return getPromptInputAttributes(requestBody.prompt);
  if (modelId.includes('mistral')) return getPromptInputAttributes(requestBody.prompt);
  return {};
}

type StreamProcessor = (parsedChunk: ParsedChunk, state: StreamResponseState) => void;

function resolveStreamProcessor(modelId: string): StreamProcessor | undefined {
  if (modelId.includes('amazon.titan')) return processTitanChunk;
  if (modelId.includes('anthropic.claude')) return processClaudeChunk;
  if (modelId.includes('amazon.nova')) return processNovaChunk;
  if (modelId.includes('meta.llama')) return processLlamaChunk;
  if (modelId.includes('cohere.command-r')) return processCohereRChunk;
  if (modelId.includes('cohere.command')) return processCohereChunk;
  if (modelId.includes('mistral')) return processMistralChunk;
  return undefined;
}

/** Collects the stream items into a state and sets the span attributes from it when the stream ends. */
async function* instrumentStream<T>(
  stream: AsyncIterable<T>,
  span: Span,
  abortSignal: AbortSignal | undefined,
  processItem: (item: T, state: StreamResponseState) => void,
): AsyncGenerator<T> {
  const state: StreamResponseState = { finishReasons: [], responseTexts: [], toolCalls: [] };
  try {
    for await (const item of stream) {
      processItem(item, state);
      yield item;
    }
  } catch (error) {
    span.setStatus({ code: SPAN_STATUS_ERROR, message: abortSignal?.aborted ? 'cancelled' : 'internal_error' });
    throw error;
  } finally {
    endStreamSpan(span, state, false);
  }
}

function processConverseStreamEvent(event: ConverseStreamOutput, state: StreamResponseState): void {
  pushFinishReason(state, event.messageStop?.stopReason);
  const usage = event.metadata?.usage;
  if (usage) {
    // With prompt caching, `inputTokens` leaves out cache reads and writes, which the conventions count as input.
    state.promptTokens =
      typeof usage.inputTokens === 'number'
        ? usage.inputTokens + (usage.cacheReadInputTokens ?? 0) + (usage.cacheWriteInputTokens ?? 0)
        : undefined;
    state.completionTokens = usage.outputTokens;
    state.cacheReadInputTokens = usage.cacheReadInputTokens;
    state.cacheCreationInputTokens = usage.cacheWriteInputTokens;
  }
}

function setStopReason(span: Span, stopReason: string | undefined): void {
  if (stopReason !== undefined) {
    span.setAttribute(GEN_AI_RESPONSE_FINISH_REASONS, JSON.stringify([stopReason]));
  }
}

function pushFinishReason(state: StreamResponseState, reason: unknown): void {
  if (typeof reason === 'string') {
    state.finishReasons.push(reason);
  }
}

function parseRequestBody(body: unknown): ParsedChunk {
  // `InvokeModel` takes the body as a JSON string or as bytes.
  const text = typeof body === 'string' ? body : body instanceof Uint8Array ? textDecoder.decode(body) : undefined;
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
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

function processNovaChunk(parsedChunk: ParsedChunk, state: StreamResponseState): void {
  const usage = parsedChunk.metadata?.usage;
  if (typeof usage?.inputTokens === 'number') {
    state.promptTokens = usage.inputTokens;
  }
  if (typeof usage?.outputTokens === 'number') {
    state.completionTokens = usage.outputTokens;
  }
  pushFinishReason(state, parsedChunk.messageStop?.stopReason);
}

function processClaudeChunk(parsedChunk: ParsedChunk, state: StreamResponseState): void {
  const inputUsage = parsedChunk.message?.usage;
  if (typeof inputUsage?.cache_read_input_tokens === 'number') {
    state.cacheReadInputTokens = inputUsage.cache_read_input_tokens;
  }
  if (typeof inputUsage?.cache_creation_input_tokens === 'number') {
    state.cacheCreationInputTokens = inputUsage.cache_creation_input_tokens;
  }
  if (typeof inputUsage?.input_tokens === 'number') {
    // Anthropic's `input_tokens` leaves out cache reads and writes, which the conventions count as input.
    state.promptTokens =
      inputUsage.input_tokens + (state.cacheReadInputTokens ?? 0) + (state.cacheCreationInputTokens ?? 0);
  }
  // `message_start` carries only a placeholder output count. The final count arrives in `message_delta`.
  if (typeof parsedChunk.usage?.output_tokens === 'number') {
    state.completionTokens = parsedChunk.usage.output_tokens;
  }
  pushFinishReason(state, parsedChunk.delta?.stop_reason);
}

function processTitanChunk(parsedChunk: ParsedChunk, state: StreamResponseState): void {
  if (typeof parsedChunk.inputTextTokenCount === 'number') {
    state.promptTokens = parsedChunk.inputTextTokenCount;
  }
  if (typeof parsedChunk.totalOutputTextTokenCount === 'number') {
    state.completionTokens = parsedChunk.totalOutputTextTokenCount;
  }
  pushFinishReason(state, parsedChunk.completionReason);
}

function processLlamaChunk(parsedChunk: ParsedChunk, state: StreamResponseState): void {
  if (typeof parsedChunk.prompt_token_count === 'number') {
    state.promptTokens = parsedChunk.prompt_token_count;
  }
  if (typeof parsedChunk.generation_token_count === 'number') {
    state.completionTokens = parsedChunk.generation_token_count;
  }
  pushFinishReason(state, parsedChunk.stop_reason);
}

/**
 * Bedrock adds the token counts to the last chunk of a stream. For models that send no counts of their own,
 * this is the only real count.
 */
function processInvocationMetrics(parsedChunk: ParsedChunk, state: StreamResponseState): void {
  const metrics = parsedChunk['amazon-bedrock-invocationMetrics'];
  if (typeof metrics?.inputTokenCount === 'number') {
    state.promptTokens = metrics.inputTokenCount;
  }
  if (typeof metrics?.outputTokenCount === 'number') {
    state.completionTokens = metrics.outputTokenCount;
  }
}

function processMistralChunk(parsedChunk: ParsedChunk, state: StreamResponseState): void {
  processInvocationMetrics(parsedChunk, state);
  pushFinishReason(state, parsedChunk.outputs?.[0]?.stop_reason);
}

function processCohereChunk(parsedChunk: ParsedChunk, state: StreamResponseState): void {
  processInvocationMetrics(parsedChunk, state);
  pushFinishReason(state, parsedChunk.generations?.[0]?.finish_reason);
}

function processCohereRChunk(parsedChunk: ParsedChunk, state: StreamResponseState): void {
  processInvocationMetrics(parsedChunk, state);
  pushFinishReason(state, parsedChunk.finish_reason);
}
