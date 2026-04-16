/* eslint-disable max-lines */
import { captureException } from '../../exports';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../../semanticAttributes';
import { SPAN_STATUS_ERROR } from '../../tracing';
import { startSpanManual } from '../../tracing/trace';
import type { Span, SpanAttributeValue } from '../../types-hoist/span';
import {
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE,
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
  GEN_AI_TOOL_INPUT_ATTRIBUTE,
  GEN_AI_TOOL_NAME_ATTRIBUTE,
  GEN_AI_TOOL_OUTPUT_ATTRIBUTE,
} from '../ai/gen-ai-attributes';
import { resolveAIRecordingOptions, shouldEnableTruncation } from '../ai/utils';
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
  getAgentAttributesFromMetadata,
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
  const enableTruncation = shouldEnableTruncation(options.enableTruncation);

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
        enableTruncation,
        invocationParams,
        metadata,
      );
      const modelName = attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE];
      const operationName = attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE];

      startSpanManual(
        {
          name: `${operationName} ${modelName}`,
          op: 'gen_ai.chat',
          attributes: {
            ...getAgentAttributesFromMetadata(metadata),
            ...attributes,
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
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
        enableTruncation,
        invocationParams,
        metadata,
      );

      const toolDefsJson = extractToolDefinitions(extraParams);
      if (toolDefsJson) {
        attributes[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE] = toolDefsJson;
      }

      const modelName = attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE];
      const operationName = attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE];

      startSpanManual(
        {
          name: `${operationName} ${modelName}`,
          op: 'gen_ai.chat',
          attributes: {
            ...getAgentAttributesFromMetadata(metadata),
            ...attributes,
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.chat',
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
    handleLLMError(error: Error, runId: string) {
      const span = spanMap.get(runId);
      if (span?.isRecording()) {
        span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
        exitSpan(runId);
      }

      captureException(error, {
        mechanism: {
          handled: false,
          type: `${LANGCHAIN_ORIGIN}.llm_error_handler`,
        },
      });
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

      const chainName = runName || chain.name || 'unknown_chain';
      const attributes: Record<string, SpanAttributeValue> = {
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.langchain',
        'langchain.chain.name': chainName,
      };

      if (recordInputs) {
        attributes['langchain.chain.inputs'] = JSON.stringify(inputs);
      }

      startSpanManual(
        {
          name: `chain ${chainName}`,
          op: 'gen_ai.invoke_agent',
          attributes: {
            ...attributes,
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.invoke_agent',
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
    handleChainError(error: Error, runId: string) {
      const span = spanMap.get(runId);
      if (span?.isRecording()) {
        span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
        exitSpan(runId);
      }

      captureException(error, {
        mechanism: {
          handled: false,
          type: `${LANGCHAIN_ORIGIN}.chain_error_handler`,
        },
      });
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
        ...getAgentAttributesFromMetadata(metadata),
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: LANGCHAIN_ORIGIN,
        [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'execute_tool',
        [GEN_AI_TOOL_NAME_ATTRIBUTE]: toolName,
      };

      if (recordInputs) {
        attributes[GEN_AI_TOOL_INPUT_ATTRIBUTE] = input;
      }

      startSpanManual(
        {
          name: `execute_tool ${toolName}`,
          op: 'gen_ai.execute_tool',
          attributes: {
            ...attributes,
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.execute_tool',
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
            [GEN_AI_TOOL_OUTPUT_ATTRIBUTE]: typeof content === 'string' ? content : JSON.stringify(content),
          });
        }
        exitSpan(runId);
      }
    },

    // Tool Error Handler
    handleToolError(error: Error, runId: string) {
      const span = spanMap.get(runId);
      if (span?.isRecording()) {
        span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
        exitSpan(runId);
      }

      captureException(error, {
        mechanism: {
          handled: false,
          type: `${LANGCHAIN_ORIGIN}.tool_error_handler`,
        },
      });
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
