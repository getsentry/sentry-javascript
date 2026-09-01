/* eslint-disable max-lines */
import {
  getClient,
  hasSpanStreamingEnabled,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_STATUS_ERROR,
  startSpanManual,
  stringify,
} from '@sentry/core';
import type { Span, SpanAttributeValue } from '@sentry/core';
import {
  GEN_AI_OPERATION_NAME,
  GEN_AI_PIPELINE_NAME,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_TOOL_CALL_ARGUMENTS,
  GEN_AI_TOOL_CALL_RESULT,
  GEN_AI_TOOL_DEFINITIONS,
  GEN_AI_TOOL_NAME,
  SENTRY_OP,
} from '@sentry/conventions/attributes';
import { GEN_AI_CHAT, GEN_AI_EXECUTE_TOOL, GEN_AI_INVOKE_AGENT } from '@sentry/conventions/op';
import { resolveAIRecordingOptions } from '../core/utils';
import { LANGCHAIN_ORIGIN } from './constants';
import type {
  LangChainCallbackHandler,
  LangChainLLMResult,
  LangChainMessage,
  LangChainOptions,
  LangChainSerialized,
} from './types';
import {
  extractChatModelRequestAttributes,
  extractLLMRequestAttributes,
  extractLlmResponseAttributes,
  extractToolDefinitions,
  getAgentNameFromMetadata,
  getInvocationParams,
} from './utils';

/**
 * Creates a Sentry callback handler for LangChain
 * Returns a plain object that LangChain will call via duck-typing
 *
 * This is a stateful handler that tracks spans across multiple LangChain executions.
 */
export function createLangChainCallbackHandler(options: LangChainOptions = {}): LangChainCallbackHandler {
  const { recordInputs, recordOutputs } = resolveAIRecordingOptions(options);

  // Internal state - single instance tracks all spans
  const spanMap = new Map<string, Span>();

  /**
   * Exit a span and clean up
   */
  const exitSpan = (runId: string): void => {
    const span = spanMap.get(runId);
    if (span?.isRecording()) {
      span.end();
      spanMap.delete(runId);
    }
  };

  /**
   * Handler for LLM Start
   * This handler will be called by LangChain's callback handler when an LLM event is detected.
   */
  const handler: LangChainCallbackHandler = {
    // Required LangChain BaseCallbackHandler properties
    lc_serializable: false,
    lc_namespace: ['langchain_core', 'callbacks', 'sentry'],
    lc_secrets: undefined,
    lc_attributes: undefined,
    lc_aliases: undefined,
    lc_serializable_keys: undefined,
    lc_id: ['langchain_core', 'callbacks', 'sentry'],
    lc_kwargs: {},
    name: 'SentryCallbackHandler',

    // BaseCallbackHandlerInput boolean flags
    ignoreLLM: false,
    ignoreChain: false,
    ignoreAgent: false,
    ignoreRetriever: false,
    ignoreCustomEvent: false,
    raiseError: false,
    awaitHandlers: true,

    handleLLMStart(
      llm: unknown,
      prompts: string[],
      runId: string,
      _parentRunId?: string,
      _extraParams?: Record<string, unknown>,
      tags?: string[],
      metadata?: Record<string, unknown>,
      _runName?: string,
    ) {
      const invocationParams = getInvocationParams(tags);
      const attributes = extractLLMRequestAttributes(
        llm as LangChainSerialized,
        prompts,
        recordInputs,
        invocationParams,
        metadata,
      );
      const modelName = attributes[GEN_AI_REQUEST_MODEL] || 'unknown';
      const operationName =
        typeof attributes[GEN_AI_OPERATION_NAME] === 'string' ? attributes[GEN_AI_OPERATION_NAME] : 'unknown';
      const client = getClient();

      startSpanManual(
        {
          // With span streaming, omit the `'unknown'` model sentinel so the name stays low-cardinality.
          name:
            (typeof modelName === 'string' && modelName !== 'unknown') || !(client && hasSpanStreamingEnabled(client))
              ? `${operationName} ${modelName}`
              : operationName,
          attributes: {
            ...getAgentNameFromMetadata(metadata),
            ...attributes,
            [SENTRY_OP]: GEN_AI_CHAT,
          },
        },
        span => {
          spanMap.set(runId, span);
          return span;
        },
      );
    },

    // Chat Model Start Handler
    handleChatModelStart(
      llm: unknown,
      messages: unknown,
      runId: string,
      _parentRunId?: string,
      extraParams?: Record<string, unknown>,
      tags?: string[],
      metadata?: Record<string, unknown>,
      _runName?: string,
    ) {
      const invocationParams = getInvocationParams(tags);
      const attributes = extractChatModelRequestAttributes(
        llm as LangChainSerialized,
        messages as LangChainMessage[][],
        recordInputs,
        invocationParams,
        metadata,
      );

      const toolDefsJson = extractToolDefinitions(extraParams);
      if (toolDefsJson) {
        attributes[GEN_AI_TOOL_DEFINITIONS] = toolDefsJson;
      }

      const modelName = attributes[GEN_AI_REQUEST_MODEL] || 'unknown';
      const operationName =
        typeof attributes[GEN_AI_OPERATION_NAME] === 'string' ? attributes[GEN_AI_OPERATION_NAME] : 'unknown';
      const client = getClient();

      startSpanManual(
        {
          // With span streaming, omit the `'unknown'` model sentinel so the name stays low-cardinality.
          name:
            (typeof modelName === 'string' && modelName !== 'unknown') || !(client && hasSpanStreamingEnabled(client))
              ? `${operationName} ${modelName}`
              : operationName,
          attributes: {
            ...getAgentNameFromMetadata(metadata),
            ...attributes,
            [SENTRY_OP]: GEN_AI_CHAT,
          },
        },
        span => {
          spanMap.set(runId, span);
          return span;
        },
      );
    },

    // LLM End Handler - note: handleLLMEnd with capital LLM (used by both LLMs and chat models!)
    handleLLMEnd(
      output: unknown,
      runId: string,
      _parentRunId?: string,
      _tags?: string[],
      _extraParams?: Record<string, unknown>,
    ) {
      const span = spanMap.get(runId);
      if (span?.isRecording()) {
        const attributes = extractLlmResponseAttributes(output as LangChainLLMResult, recordOutputs);
        if (attributes) {
          span.setAttributes(attributes);
        }
        exitSpan(runId);
      }
    },

    // LLM Error Handler - note: handleLLMError with capital LLM
    handleLLMError(_error: Error, runId: string) {
      // The error is surfaced to the caller (invoke() rejects), so we only mark the span failed and
      // do not record it.
      const span = spanMap.get(runId);
      if (span?.isRecording()) {
        span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
        exitSpan(runId);
      }
    },

    // Chain Start Handler
    handleChainStart(
      chain: { name?: string },
      inputs: Record<string, unknown>,
      runId: string,
      _parentRunId?: string,
      _tags?: string[],
      metadata?: Record<string, unknown>,
      _runType?: string,
      runName?: string,
    ) {
      // Skip chain spans when inside an agent context (createReactAgent).
      // The agent already creates an invoke_agent span; internal chain steps
      // (ChannelWrite, Branch, prompt, etc.) are noise.
      if (metadata?.__sentry_langgraph__) {
        return;
      }

      const chainName = runName || chain.name;
      const attributes: Record<string, SpanAttributeValue> = {
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.langchain',
        [GEN_AI_OPERATION_NAME]: 'invoke_agent',
      };

      if (chainName) {
        attributes[GEN_AI_PIPELINE_NAME] = chainName;
      }

      if (recordInputs) {
        attributes['langchain.chain.inputs'] = JSON.stringify(inputs);
      }

      const client = getClient();

      startSpanManual(
        {
          // With span streaming, the name leads with the operation per the agent templates. The
          // chain name is bounded, so it stays; the `'unknown_chain'` sentinel is dropped instead.
          name: !(client && hasSpanStreamingEnabled(client))
            ? `chain ${chainName || 'unknown_chain'}`
            : chainName
              ? `invoke_agent ${chainName}`
              : 'invoke_agent',
          attributes: {
            ...attributes,
            [SENTRY_OP]: GEN_AI_INVOKE_AGENT,
          },
        },
        span => {
          spanMap.set(runId, span);
          return span;
        },
      );
    },

    // Chain End Handler
    handleChainEnd(outputs: unknown, runId: string) {
      const span = spanMap.get(runId);
      if (span?.isRecording()) {
        // Add outputs if recordOutputs is enabled
        if (recordOutputs) {
          span.setAttributes({
            'langchain.chain.outputs': JSON.stringify(outputs),
          });
        }
        exitSpan(runId);
      }
    },

    // Chain Error Handler
    handleChainError(_error: Error, runId: string) {
      // The error is surfaced to the caller (invoke() rejects), so we only mark the span failed and
      // do not record it.
      const span = spanMap.get(runId);
      if (span?.isRecording()) {
        span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
        exitSpan(runId);
      }
    },

    // Tool Start Handler
    handleToolStart(
      tool: { name?: string },
      input: string,
      runId: string,
      _parentRunId?: string,
      _tags?: string[],
      metadata?: Record<string, unknown>,
      runName?: string,
    ) {
      // Skip tool spans when inside an agent context (createReactAgent).
      // Tool spans are created by wrapToolsWithSpans with richer attributes.
      if (metadata?.__sentry_langgraph__) {
        return;
      }

      // runName is set to tool.name by LangChain's StructuredTool.call()
      const toolName = runName || tool.name || 'unknown_tool';
      const attributes: Record<string, SpanAttributeValue> = {
        ...getAgentNameFromMetadata(metadata),
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: LANGCHAIN_ORIGIN,
        [GEN_AI_OPERATION_NAME]: 'execute_tool',
        [GEN_AI_TOOL_NAME]: toolName,
      };

      if (recordInputs) {
        attributes[GEN_AI_TOOL_CALL_ARGUMENTS] = input;
      }

      startSpanManual(
        {
          name: `execute_tool ${toolName}`,
          attributes: {
            ...attributes,
            [SENTRY_OP]: GEN_AI_EXECUTE_TOOL,
          },
        },
        span => {
          spanMap.set(runId, span);
          return span;
        },
      );
    },

    // Tool End Handler
    handleToolEnd(output: unknown, runId: string) {
      const span = spanMap.get(runId);
      if (span?.isRecording()) {
        if (recordOutputs) {
          // LangChain tools may return ToolMessage objects — extract the content
          const outputObj = output as Record<string, unknown> | undefined;
          const content =
            outputObj && typeof outputObj === 'object' && 'content' in outputObj ? outputObj.content : output;
          span.setAttributes({
            [GEN_AI_TOOL_CALL_RESULT]: stringify(content, String),
          });
        }
        exitSpan(runId);
      }
    },

    // Tool Error Handler
    handleToolError(_error: Error, runId: string) {
      // The error is surfaced to the caller (invoke() rejects), so we only mark the span failed and
      // do not record it.
      const span = spanMap.get(runId);
      if (span?.isRecording()) {
        span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
        exitSpan(runId);
      }
    },

    // LangChain BaseCallbackHandler required methods
    copy() {
      return handler;
    },

    toJSON() {
      return {
        lc: 1,
        type: 'not_implemented',
        id: handler.lc_id,
      };
    },

    toJSONNotImplemented() {
      return {
        lc: 1,
        type: 'not_implemented',
        id: handler.lc_id,
      };
    },
  };

  return handler;
}

export { instrumentLangChainEmbeddings } from './embeddings';
