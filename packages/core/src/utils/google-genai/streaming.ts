import { captureException } from '../../exports';
import { SPAN_STATUS_ERROR } from '../../tracing';
import type { Span } from '../../types-hoist/span';
import {
  GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE,
  GEN_AI_RESPONSE_ID_ATTRIBUTE,
  GEN_AI_RESPONSE_MODEL_ATTRIBUTE,
  GEN_AI_RESPONSE_STREAMING_ATTRIBUTE,
  GEN_AI_RESPONSE_TEXT_ATTRIBUTE,
  GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE,
} from '../ai/gen-ai-attributes';
import type { GoogleGenAIResponse } from './types';

/**
 * State object used to accumulate information from a stream of Google GenAI events.
 */
interface StreamingState {
  /** Collected response text fragments (for output recording). */
  responseTexts: string[];
  /** Reasons for finishing the response, as reported by the API. */
  finishReasons: string[];
  /** The response ID. */
  responseId: string;
  /** The model name. */
  responseModel: string;
  /** Number of prompt/input tokens used. */
  promptTokens: number | undefined;
  /** Number of completion/output tokens used. */
  completionTokens: number | undefined;
  /** Number of total tokens used. */
  totalTokens: number | undefined;
  /** Accumulated tool calls (finalized) */
  toolCalls: Array<Record<string, unknown>>;
}

/**
 * Checks if a response chunk contains an error
 * @param chunk - The response chunk to check
 * @param span - The span to update if error is found
 * @returns Whether an error occurred
 */
function isErrorChunk(chunk: GoogleGenAIResponse, span: Span): boolean {
  // Check for errors in the response
  if (chunk && typeof chunk === 'object') {
    // Google GenAI may include error information in promptFeedback
    if (chunk.promptFeedback && typeof chunk.promptFeedback === 'object') {
      const feedback = chunk.promptFeedback;
      if (feedback.blockReason && typeof feedback.blockReason === 'string') {
        // Use blockReasonMessage if available (more descriptive), otherwise use blockReason (enum)
        const errorMessage = feedback.blockReasonMessage ? feedback.blockReasonMessage : feedback.blockReason;

        span.setStatus({ code: SPAN_STATUS_ERROR, message: `Content blocked: ${errorMessage}` });
        captureException(`Content blocked: ${errorMessage}`, {
          mechanism: {
            handled: false,
            type: 'auto.ai.google_genai',
          },
        });
        return true;
      }
    }

    // Check for blocked candidates based on finish reasons
    if (chunk.candidates) {
      for (const candidate of chunk.candidates) {
        if (candidate && typeof candidate === 'object' && candidate.finishReason) {
          span.setStatus({
            code: SPAN_STATUS_ERROR,
            message: `Model stopped generating tokens: ${candidate.finishReason}`,
          });
          captureException(`Model stopped generating tokens: ${candidate.finishReason}`, {
            mechanism: {
              handled: false,
              type: 'auto.ai.google_genai',
            },
          });
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Processes response metadata from a chunk
 * @param chunk - The response chunk to process
 * @param state - The state of the streaming process
 */
function handleResponseMetadata(chunk: GoogleGenAIResponse, state: StreamingState): void {
  if (!chunk || typeof chunk !== 'object') return;

  // Extract response ID
  if (chunk.responseId && typeof chunk.responseId === 'string') {
    state.responseId = chunk.responseId;
  }

  // Extract model version
  if (chunk.modelVersion && typeof chunk.modelVersion === 'string') {
    state.responseModel = chunk.modelVersion;
  }

  // Extract usage metadata
  if (chunk.usageMetadata && typeof chunk.usageMetadata === 'object') {
    const usage = chunk.usageMetadata;
    if (typeof usage.promptTokenCount === 'number') {
      state.promptTokens = usage.promptTokenCount;
    }
    if (typeof usage.candidatesTokenCount === 'number') {
      state.completionTokens = usage.candidatesTokenCount;
    }
    if (typeof usage.totalTokenCount === 'number') {
      state.totalTokens = usage.totalTokenCount;
    }
  }
}

/**
 * Processes candidate content from a response chunk
 * @param chunk - The response chunk to process
 * @param state - The state of the streaming process
 * @param recordOutputs - Whether to record outputs
 */
function handleCandidateContent(chunk: GoogleGenAIResponse, state: StreamingState, recordOutputs: boolean): void {
  if (!chunk?.candidates) return;

  for (const candidate of chunk.candidates) {
    if (!candidate || typeof candidate !== 'object') continue;

    // Extract finish reason
    if (candidate.finishReason) {
      if (!state.finishReasons.includes(candidate.finishReason)) {
        state.finishReasons.push(candidate.finishReason);
      }
    }

    // Extract content
    if (candidate.content) {
      const content = candidate.content;
      if (content.parts) {
        for (const part of content.parts) {
          // Extract text content for output recording
          if (recordOutputs && part.text) {
            state.responseTexts.push(part.text);
          }

          // Extract function calls
          if (part.functionCall) {
            state.toolCalls.push({
              type: 'function',
              id: part.functionCall?.id,
              name: part.functionCall?.name,
              arguments: part.functionCall?.args,
            });
          }
        }
      }
    }
  }
}

/**
 * Processes a single chunk from the Google GenAI stream
 * @param chunk - The chunk to process
 * @param state - The state of the streaming process
 * @param recordOutputs - Whether to record outputs
 * @param span - The span to update
 */
function processChunk(chunk: GoogleGenAIResponse, state: StreamingState, recordOutputs: boolean, span: Span): void {
  if (!chunk || typeof chunk !== 'object') {
    return;
  }

  const isError = isErrorChunk(chunk, span);
  if (isError) return;

  handleResponseMetadata(chunk, state);
  handleCandidateContent(chunk, state, recordOutputs);
}

/**
 * Instruments an async iterable stream of Google GenAI response chunks, updates the span with
 * streaming attributes and (optionally) the aggregated output text, and yields
 * each chunk from the input stream unchanged.
 */
export async function* instrumentStream(
  stream: AsyncIterable<GoogleGenAIResponse>,
  span: Span,
  recordOutputs: boolean,
): AsyncGenerator<GoogleGenAIResponse, void, unknown> {
  const state: StreamingState = {
    responseTexts: [],
    finishReasons: [],
    responseId: '',
    responseModel: '',
    promptTokens: undefined,
    completionTokens: undefined,
    totalTokens: undefined,
    toolCalls: [],
  };

  try {
    for await (const chunk of stream) {
      processChunk(chunk, state, recordOutputs, span);
      yield chunk;
    }
  } finally {
    // Set common response attributes if available
    if (state.responseId) {
      span.setAttributes({
        [GEN_AI_RESPONSE_ID_ATTRIBUTE]: state.responseId,
      });
    }
    if (state.responseModel) {
      span.setAttributes({
        [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: state.responseModel,
      });
    }

    // Set token usage attributes
    if (state.promptTokens !== undefined) {
      span.setAttributes({
        [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: state.promptTokens,
      });
    }
    if (state.completionTokens !== undefined) {
      span.setAttributes({
        [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: state.completionTokens,
      });
    }
    if (state.totalTokens !== undefined) {
      span.setAttributes({
        [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: state.totalTokens,
      });
    }

    // Mark as streaming response
    span.setAttributes({
      [GEN_AI_RESPONSE_STREAMING_ATTRIBUTE]: true,
    });

    // Set finish reasons if available
    if (state.finishReasons.length > 0) {
      span.setAttributes({
        [GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]: JSON.stringify(state.finishReasons),
      });
    }

    // Set response text if recording outputs
    if (recordOutputs && state.responseTexts.length > 0) {
      span.setAttributes({
        [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: state.responseTexts.join(''),
      });
    }

    // Set tool calls if any were captured
    if (recordOutputs && state.toolCalls.length > 0) {
      span.setAttributes({
        [GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE]: JSON.stringify(state.toolCalls),
      });
    }

    span.end();
  }
}
