import { captureException } from '../../exports';
import { SPAN_STATUS_ERROR } from '../../tracing';
import type { Span } from '../../types-hoist/span';
import { finalizeStreamSpan } from '../ai/utils';
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
  responseId?: string;
  /** The model name. */
  responseModel?: string;
  /** Number of prompt/input tokens used. */
  promptTokens?: number;
  /** Number of completion/output tokens used. */
  completionTokens?: number;
  /** Number of total tokens used. */
  totalTokens?: number;
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
  const feedback = chunk?.promptFeedback;
  if (feedback?.blockReason) {
    const message = feedback.blockReasonMessage ?? feedback.blockReason;
    span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
    captureException(`Content blocked: ${message}`, {
      mechanism: { handled: false, type: 'auto.ai.google_genai' },
    });
    return true;
  }
  return false;
}

/**
 * Processes response metadata from a chunk
 * @param chunk - The response chunk to process
 * @param state - The state of the streaming process
 */
function handleResponseMetadata(chunk: GoogleGenAIResponse, state: StreamingState): void {
  if (typeof chunk.responseId === 'string') state.responseId = chunk.responseId;
  if (typeof chunk.modelVersion === 'string') state.responseModel = chunk.modelVersion;

  const usage = chunk.usageMetadata;
  if (usage) {
    if (typeof usage.promptTokenCount === 'number') state.promptTokens = usage.promptTokenCount;
    if (typeof usage.candidatesTokenCount === 'number') state.completionTokens = usage.candidatesTokenCount;
    if (typeof usage.totalTokenCount === 'number') state.totalTokens = usage.totalTokenCount;
  }
}

/**
 * Processes candidate content from a response chunk
 * @param chunk - The response chunk to process
 * @param state - The state of the streaming process
 * @param recordOutputs - Whether to record outputs
 */
function handleCandidateContent(chunk: GoogleGenAIResponse, state: StreamingState, recordOutputs: boolean): void {
  if (Array.isArray(chunk.functionCalls)) {
    state.toolCalls.push(...chunk.functionCalls);
  }

  for (const candidate of chunk.candidates ?? []) {
    if (candidate?.finishReason && !state.finishReasons.includes(candidate.finishReason)) {
      state.finishReasons.push(candidate.finishReason);
    }

    for (const part of candidate?.content?.parts ?? []) {
      if (recordOutputs && part.text) state.responseTexts.push(part.text);
      if (part.functionCall) {
        state.toolCalls.push({
          type: 'function',
          id: part.functionCall.id,
          name: part.functionCall.name,
          arguments: part.functionCall.args,
        });
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
  if (!chunk || isErrorChunk(chunk, span)) return;
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
    toolCalls: [],
  };

  try {
    for await (const chunk of stream) {
      processChunk(chunk, state, recordOutputs, span);
      yield chunk;
    }
  } finally {
    finalizeStreamSpan(span, state, recordOutputs);
  }
}
