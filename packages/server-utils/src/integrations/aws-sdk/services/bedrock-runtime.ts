import type { Span } from '@sentry/core';
import { debug, isObjectLike } from '@sentry/core';
import {
  GEN_AI_OPERATION_NAME,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MAX_TOKENS,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_REQUEST_STOP_SEQUENCES as ATTR_GEN_AI_REQUEST_STOP_SEQUENCES,
  GEN_AI_REQUEST_TEMPERATURE,
  GEN_AI_REQUEST_TOP_P,
  GEN_AI_RESPONSE_FINISH_REASONS,
  GEN_AI_RESPONSE_ID,
  GEN_AI_RESPONSE_MODEL,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
} from '@sentry/conventions/attributes';
import { GEN_AI_CHAT, GEN_AI_GENERATE_CONTENT } from '@sentry/conventions/op';
import type { GenAiOptions } from '../../../ai/core/utils';
import { getTokenUsageAttributes, resolveAIRecordingOptions } from '../../../ai/core/utils';
import { DEBUG_BUILD } from '../../../debug-build';
import {
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
  GEN_AI_OPERATION_NAME_VALUE_GENERATE_CONTENT,
  GEN_AI_SYSTEM_VALUE_AWS_BEDROCK,
} from '../constants';
import type { NormalizedRequest, NormalizedResponse } from '../types';
import type { BedrockStreamState } from './bedrock-runtime-content';
import {
  appendStreamBlock,
  getClaudeInputAttributes,
  getClaudeOutputBlocks,
  getConverseInputAttributes,
  getConverseOutputBlocks,
  getPromptInputAttributes,
  instrumentBedrockStream,
  setOutputAttributes,
  startStreamToolCall,
  textOutputBlocks,
} from './bedrock-runtime-content';
import type { RequestMetadata, ServiceExtension } from './ServiceExtension';

// Simplified types inlined from @aws-sdk/client-bedrock-runtime
// Only the fields accessed by this instrumentation are included
interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadInputTokens?: number;
  cacheWriteInputTokens?: number;
}

// Streamed `InvokeModel` chunks and response bodies are model-family-specific JSON (titan, nova,
// claude, llama, cohere, mistral); the record helpers probe the shapes defensively, so `any` instead
// of one structural type per family.
type ParsedChunk = any;

const textDecoder = new TextDecoder();

export class BedrockRuntimeServiceExtension implements ServiceExtension {
  private readonly _options: GenAiOptions;

  public constructor(options: GenAiOptions = {}) {
    this._options = options;
  }

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

    if (resolveAIRecordingOptions(this._options).recordInputs) {
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

    const requestBody = parseJsonBody(request.commandInput?.body);
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
    }

    if (requestBody && typeof modelId === 'string' && resolveAIRecordingOptions(this._options).recordInputs) {
      Object.assign(spanAttributes, getInvokeModelInputAttributes(modelId, requestBody));
    }

    return {
      spanName,
      spanOp: GEN_AI_GENERATE_CONTENT,
      isStream,
      spanAttributes,
    };
  }

  private _responseHookConverse(response: NormalizedResponse, span: Span): void {
    const { output, stopReason, usage } = response.data;

    setStopReason(span, stopReason);
    setUsage(span, usage);

    if (resolveAIRecordingOptions(this._options).recordOutputs) {
      setOutputAttributes(span, getConverseOutputBlocks(output?.message), stopReason);
    }
  }

  private _responseHookConverseStream(response: NormalizedResponse, span: Span): void {
    if (!response.data?.stream) {
      // Without a stream there is nothing to wrap that would end the span later.
      span.end();
      return;
    }

    // Wrap and replace the response stream in place to process events into telemetry
    // before yielding to the user.
    response.data.stream = instrumentBedrockStream(
      response.data.stream,
      span,
      resolveAIRecordingOptions(this._options).recordOutputs,
      processConverseStreamEvent,
    );
  }

  private _responseHookInvokeModel(response: NormalizedResponse, span: Span): void {
    const currentModelId = response.request.commandInput?.modelId;
    const responseBody = parseJsonBody(response.data?.body);
    if (!responseBody || typeof currentModelId !== 'string') {
      return;
    }

    const recordOutputs = resolveAIRecordingOptions(this._options).recordOutputs;

    if (currentModelId.includes('amazon.titan')) {
      if (responseBody.inputTextTokenCount !== undefined) {
        span.setAttribute(GEN_AI_USAGE_INPUT_TOKENS, responseBody.inputTextTokenCount);
      }
      if (responseBody.results?.[0]?.tokenCount !== undefined) {
        span.setAttribute(GEN_AI_USAGE_OUTPUT_TOKENS, responseBody.results[0].tokenCount);
      }
      setStopReason(span, responseBody.results?.[0]?.completionReason);
      if (recordOutputs) {
        setOutputAttributes(
          span,
          textOutputBlocks(responseBody.results?.[0]?.outputText),
          responseBody.results?.[0]?.completionReason,
        );
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
      setStopReason(span, responseBody.stopReason);
      if (recordOutputs) {
        setOutputAttributes(span, getConverseOutputBlocks(responseBody.output?.message), responseBody.stopReason);
      }
    } else if (currentModelId.includes('anthropic.claude')) {
      if (typeof responseBody.id === 'string') {
        span.setAttribute(GEN_AI_RESPONSE_ID, responseBody.id);
      }
      if (typeof responseBody.model === 'string') {
        span.setAttribute(GEN_AI_RESPONSE_MODEL, responseBody.model);
      }
      const usage = responseBody.usage;
      if (usage) {
        // Anthropic's `input_tokens` leaves out cache reads and writes, which the conventions count as input.
        const cacheCreation = usage.cache_creation_input_tokens;
        const cacheRead = usage.cache_read_input_tokens;
        span.setAttributes(
          getTokenUsageAttributes(
            typeof usage.input_tokens === 'number'
              ? usage.input_tokens + (cacheCreation ?? 0) + (cacheRead ?? 0)
              : undefined,
            usage.output_tokens,
            cacheCreation,
            cacheRead,
          ),
        );
      }
      setStopReason(span, responseBody.stop_reason);
      if (recordOutputs) {
        setOutputAttributes(span, getClaudeOutputBlocks(responseBody.content), responseBody.stop_reason);
      }
    } else if (currentModelId.includes('meta.llama')) {
      if (responseBody.prompt_token_count !== undefined) {
        span.setAttribute(GEN_AI_USAGE_INPUT_TOKENS, responseBody.prompt_token_count);
      }
      if (responseBody.generation_token_count !== undefined) {
        span.setAttribute(GEN_AI_USAGE_OUTPUT_TOKENS, responseBody.generation_token_count);
      }
      setStopReason(span, responseBody.stop_reason);
      if (recordOutputs) {
        setOutputAttributes(span, textOutputBlocks(responseBody.generation), responseBody.stop_reason);
      }
    } else if (currentModelId.includes('cohere.command-r')) {
      if (responseBody.text !== undefined) {
        span.setAttribute(GEN_AI_USAGE_OUTPUT_TOKENS, Math.ceil(responseBody.text.length / 6));
      }
      setStopReason(span, responseBody.finish_reason);
      if (recordOutputs) {
        setOutputAttributes(span, textOutputBlocks(responseBody.text), responseBody.finish_reason);
      }
    } else if (currentModelId.includes('cohere.command')) {
      if (responseBody.generations?.[0]?.text !== undefined) {
        span.setAttribute(GEN_AI_USAGE_OUTPUT_TOKENS, Math.ceil(responseBody.generations[0].text.length / 6));
      }
      setStopReason(span, responseBody.generations?.[0]?.finish_reason);
      if (recordOutputs) {
        setOutputAttributes(
          span,
          textOutputBlocks(responseBody.generations?.[0]?.text),
          responseBody.generations?.[0]?.finish_reason,
        );
      }
    } else if (currentModelId.includes('mistral')) {
      if (responseBody.outputs?.[0]?.text !== undefined) {
        span.setAttribute(GEN_AI_USAGE_OUTPUT_TOKENS, Math.ceil(responseBody.outputs[0].text.length / 6));
      }
      setStopReason(span, responseBody.outputs?.[0]?.stop_reason);
      if (recordOutputs) {
        setOutputAttributes(
          span,
          textOutputBlocks(responseBody.outputs?.[0]?.text),
          responseBody.outputs?.[0]?.stop_reason,
        );
      }
    }
  }

  private _responseHookInvokeModelWithResponseStream(response: NormalizedResponse, span: Span): void {
    const stream = response.data?.body;
    const modelId = response.request.commandInput?.modelId;
    if (!stream) {
      // Without a stream there is nothing to wrap that would end the span later.
      span.end();
      return;
    }

    // Resolved once: the model family is fixed for the whole stream, and for unrecognized families
    // the chunks don't need to be parsed at all.
    const processChunk = typeof modelId === 'string' ? resolveStreamProcessor(modelId) : undefined;

    // Replace the original response body with our instrumented stream, deferring span.end() until the
    // entire stream is consumed. Downstream consumers still receive the full stream.
    response.data.body = instrumentBedrockStream(
      stream as AsyncIterable<{ chunk?: { bytes?: Uint8Array } }>,
      span,
      resolveAIRecordingOptions(this._options).recordOutputs,
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

type StreamProcessor = (parsedChunk: ParsedChunk, state: BedrockStreamState) => void;

function resolveStreamProcessor(modelId: string): StreamProcessor | undefined {
  if (modelId.includes('amazon.titan')) return processTitanChunk;
  if (modelId.includes('anthropic.claude')) return processClaudeChunk;
  if (modelId.includes('amazon.nova')) return processConverseStreamEvent;
  if (modelId.includes('meta.llama')) return processLlamaChunk;
  if (modelId.includes('cohere.command-r')) {
    return withApproximatedOutputTokens(
      chunk => chunk.text,
      chunk => chunk.finish_reason,
    );
  }
  if (modelId.includes('cohere.command')) {
    return withApproximatedOutputTokens(
      chunk => chunk.generations?.[0]?.text,
      chunk => chunk.generations?.[0]?.finish_reason,
    );
  }
  if (modelId.includes('mistral')) {
    return withApproximatedOutputTokens(
      chunk => chunk.outputs?.[0]?.text,
      chunk => chunk.outputs?.[0]?.stop_reason,
    );
  }
  return undefined;
}

/**
 * These models report no token usage, so output tokens are approximated from the generated text (Bedrock
 * prices them at 6 characters per token). The count has to cover the text of all chunks, not the last one,
 * and is kept apart from the text, which is only buffered when outputs are recorded.
 */
function withApproximatedOutputTokens(
  getText: (chunk: ParsedChunk) => unknown,
  getFinishReason: (chunk: ParsedChunk) => unknown,
): StreamProcessor {
  let outputChars = 0;
  return (chunk, state) => {
    const text = getText(chunk);
    appendStreamBlock(state, 0, 'text', text);
    if (typeof text === 'string') {
      outputChars += text.length;
    }
    if (outputChars > 0) {
      state.completionTokens = Math.ceil(outputChars / 6);
    }
    pushFinishReason(state, getFinishReason(chunk));
  };
}

function parseJsonBody(body: unknown): ParsedChunk {
  // `InvokeModel` takes the body as a string or as bytes, and returns bytes.
  const text = typeof body === 'string' ? body : body instanceof Uint8Array ? textDecoder.decode(body) : undefined;
  if (!text) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(text);
    return isObjectLike(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function setStopReason(span: Span, stopReason: unknown): void {
  if (typeof stopReason === 'string') {
    span.setAttribute(GEN_AI_RESPONSE_FINISH_REASONS, JSON.stringify([stopReason]));
  }
}

function setUsage(span: Span, usage: TokenUsage | undefined): void {
  if (usage) {
    span.setAttributes(
      getTokenUsageAttributes(
        getConverseInputTokens(usage),
        usage.outputTokens,
        usage.cacheWriteInputTokens,
        usage.cacheReadInputTokens,
      ),
    );
  }
}

/**
 * With prompt caching, Converse's `inputTokens` counts only the tokens that were neither read from nor
 * written to the cache, while the conventions count all of them as input.
 * @see https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html
 */
function getConverseInputTokens(usage: TokenUsage): number | undefined {
  return typeof usage.inputTokens === 'number'
    ? usage.inputTokens + (usage.cacheReadInputTokens ?? 0) + (usage.cacheWriteInputTokens ?? 0)
    : undefined;
}

function pushFinishReason(state: BedrockStreamState, reason: unknown): void {
  if (typeof reason === 'string') {
    state.finishReasons.push(reason);
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

/** `ConverseStream` events, and Amazon Nova `InvokeModelWithResponseStream` chunks, which share their shape. */
function processConverseStreamEvent(event: ParsedChunk, state: BedrockStreamState): void {
  const { contentBlockStart, contentBlockDelta, messageStop, metadata } = event ?? {};

  const toolUse = contentBlockStart?.start?.toolUse;
  if (toolUse) {
    startStreamToolCall(state, contentBlockStart.contentBlockIndex, toolUse.toolUseId, toolUse.name);
  }

  const delta = contentBlockDelta?.delta;
  if (delta) {
    const index = contentBlockDelta.contentBlockIndex;
    if (typeof delta.text === 'string') {
      appendStreamBlock(state, index, 'text', delta.text);
    } else if (delta.toolUse) {
      appendStreamBlock(state, index, 'tool_call', delta.toolUse.input);
    } else if (delta.reasoningContent) {
      appendStreamBlock(state, index, 'reasoning', delta.reasoningContent.text);
    }
  }

  pushFinishReason(state, messageStop?.stopReason);

  const usage: TokenUsage | undefined = metadata?.usage;
  if (usage) {
    state.promptTokens = getConverseInputTokens(usage);
    state.completionTokens = usage.outputTokens;
    state.cacheReadInputTokens = usage.cacheReadInputTokens;
    state.cacheCreationInputTokens = usage.cacheWriteInputTokens;
  }
}

/**
 * Claude `InvokeModelWithResponseStream` chunks are Anthropic Messages streaming events.
 * @see https://docs.anthropic.com/en/docs/build-with-claude/streaming#event-types
 */
function processClaudeChunk(chunk: ParsedChunk, state: BedrockStreamState): void {
  switch (chunk.type) {
    case 'message_start': {
      const message = chunk.message;
      if (typeof message?.id === 'string') state.responseId = message.id;
      if (typeof message?.model === 'string') state.responseModel = message.model;
      applyClaudeUsage(message?.usage, state);
      break;
    }
    case 'content_block_start': {
      const block = chunk.content_block;
      if (block?.type === 'tool_use' || block?.type === 'server_tool_use') {
        startStreamToolCall(state, chunk.index, block.id, block.name);
      } else if (block?.type === 'text') {
        appendStreamBlock(state, chunk.index, 'text', block.text);
      } else if (block?.type === 'thinking') {
        appendStreamBlock(state, chunk.index, 'reasoning', block.thinking);
      }
      break;
    }
    case 'content_block_delta': {
      const delta = chunk.delta;
      if (delta?.type === 'text_delta') {
        appendStreamBlock(state, chunk.index, 'text', delta.text);
      } else if (delta?.type === 'input_json_delta') {
        appendStreamBlock(state, chunk.index, 'tool_call', delta.partial_json);
      } else if (delta?.type === 'thinking_delta') {
        appendStreamBlock(state, chunk.index, 'reasoning', delta.thinking);
      }
      break;
    }
    case 'message_delta':
      // The final, cumulative output token count arrives here; `message_start` only carries a placeholder.
      applyClaudeUsage(chunk.usage, state);
      pushFinishReason(state, chunk.delta?.stop_reason);
      break;
  }
}

function applyClaudeUsage(usage: ParsedChunk, state: BedrockStreamState): void {
  if (!usage) {
    return;
  }
  if (typeof usage.cache_creation_input_tokens === 'number') {
    state.cacheCreationInputTokens = usage.cache_creation_input_tokens;
  }
  if (typeof usage.cache_read_input_tokens === 'number') {
    state.cacheReadInputTokens = usage.cache_read_input_tokens;
  }
  if (typeof usage.input_tokens === 'number') {
    state.promptTokens = usage.input_tokens + (state.cacheCreationInputTokens ?? 0) + (state.cacheReadInputTokens ?? 0);
  }
  if (typeof usage.output_tokens === 'number') {
    state.completionTokens = usage.output_tokens;
  }
}

function processTitanChunk(chunk: ParsedChunk, state: BedrockStreamState): void {
  appendStreamBlock(state, 0, 'text', chunk.outputText);
  if (typeof chunk.inputTextTokenCount === 'number') {
    state.promptTokens = chunk.inputTextTokenCount;
  }
  if (typeof chunk.totalOutputTextTokenCount === 'number') {
    state.completionTokens = chunk.totalOutputTextTokenCount;
  }
  pushFinishReason(state, chunk.completionReason);
}

function processLlamaChunk(chunk: ParsedChunk, state: BedrockStreamState): void {
  appendStreamBlock(state, 0, 'text', chunk.generation);
  if (typeof chunk.prompt_token_count === 'number') {
    state.promptTokens = chunk.prompt_token_count;
  }
  if (typeof chunk.generation_token_count === 'number') {
    state.completionTokens = chunk.generation_token_count;
  }
  pushFinishReason(state, chunk.stop_reason);
}
