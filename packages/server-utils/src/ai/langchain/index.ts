/* eslint-disable max-lines */
import {
  debug,
  getActiveSpan,
  getClient,
  getRootSpan,
  hasSpanStreamingEnabled,
  LRUMap,
  SPAN_STATUS_ERROR,
  spanIsIgnored,
  spanToJSON,
  startInactiveSpan,
  stringify,
  withActiveSpan,
} from '@sentry/core';
import type { Span, SpanAttributeValue } from '@sentry/core';
import {
  GEN_AI_CONVERSATION_ID,
  GEN_AI_OPERATION_NAME,
  GEN_AI_PIPELINE_NAME,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_TOOL_CALL_ARGUMENTS,
  GEN_AI_TOOL_CALL_RESULT,
  GEN_AI_TOOL_DEFINITIONS,
  GEN_AI_TOOL_NAME,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { GEN_AI_CHAT, GEN_AI_EXECUTE_TOOL, GEN_AI_INVOKE_AGENT } from '@sentry/conventions/op';
import { DEBUG_BUILD } from '../../debug-build';
import { resolveAIRecordingOptions } from '../core/utils';
import { LANGCHAIN_ORIGIN, MAX_TRACKED_LANGCHAIN_RUNS } from './constants';
import {
  addTypeSafeClassifierResponseAttributes,
  isTypeSafeClassifier,
  startTypeSafeClassifierSpan,
} from './typesafe-classifier';
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
  getConversationIdFromMetadata,
  getInvocationParams,
} from './utils';

interface LangChainRun {
  span: Span;
  parentRunId?: string;
  // The span active when the run started, to tell whether a span was opened inside the run since.
  activeSpan?: Span;
  conversationId?: string;
  decide?: boolean;
}

/**
 * Creates a Sentry callback handler for LangChain
 * Returns a plain object that LangChain will call via duck-typing
 *
 * This is a stateful handler that tracks spans across multiple LangChain executions.
 */
export function createLangChainCallbackHandler(options: LangChainOptions = {}): LangChainCallbackHandler {
  const { recordInputs, recordOutputs } = resolveAIRecordingOptions(options);

  // Internal state - single instance tracks all spans
  const runs = new LRUMap<string, LangChainRun>(MAX_TRACKED_LANGCHAIN_RUNS);
  const getRun = (runId: string | undefined): LangChainRun | undefined => (runId ? runs.get(runId) : undefined);

  /**
   * Exit a span and clean up
   */
  const exitSpan = (runId: string): void => {
    const span = runs.remove(runId)?.span;
    if (span?.isRecording()) {
      span.end();
    }
  };

  // `LRUMap.set` would drop the oldest run without ending its span, so it is ended first, like Flue and Mastra.
  let warnedFull = false;
  const trackRun = (runId: string, run: LangChainRun): void => {
    if (runs.size >= MAX_TRACKED_LANGCHAIN_RUNS) {
      if (!warnedFull) {
        warnedFull = true;
        DEBUG_BUILD &&
          debug.warn(
            `[LangChain] More than ${MAX_TRACKED_LANGCHAIN_RUNS} runs are open, ending the oldest. Its span may be cut short.`,
          );
      }
      const oldestRunId = runs.keys()[0];
      if (oldestRunId !== undefined) {
        exitSpan(oldestRunId);
      }
    }
    runs.set(runId, run);
  };

  // Nearest first. `LRUMap.get()` marks each run recently used, so a long-running root run is not evicted while
  // its subtree is busy.
  const getAncestors = (parentRunId: string | undefined): LangChainRun[] => {
    const ancestors: LangChainRun[] = [];
    for (let run = getRun(parentRunId); run; run = getRun(run.parentRunId)) {
      ancestors.push(run);
    }
    return ancestors;
  };

  // LangChain never makes our run spans active, so a run starts under its nearest ancestor run span. Like core,
  // an ignored span only parents when it is a root, which drops its subtree. The active span stays the parent
  // if the ancestor run has no span, or if another span was opened since that run started.
  const getParentRunSpan = (ancestors: LangChainRun[], activeSpan: Span | undefined): Span | undefined => {
    for (const run of ancestors) {
      if (run.activeSpan !== activeSpan) {
        return undefined;
      }
      if (!spanIsIgnored(run.span) || getRootSpan(run.span) === run.span) {
        return run.span;
      }
    }
    return undefined;
  };

  const startRunSpan = (runId: string, parentRunId: string | undefined, start: () => Span): LangChainRun => {
    const ancestors = getAncestors(parentRunId);
    const activeSpan = getActiveSpan();
    const parentSpan = getParentRunSpan(ancestors, activeSpan);
    const span = parentSpan ? withActiveSpan(parentSpan, start) : start();

    // `@langchain/core` >= 1.1.40 keeps `configurable` out of run metadata, so often only the chat span knows
    // the conversation id. The own id is read off the span, since one from `Sentry.setConversationId()` is
    // only set there.
    const ownId = spanToJSON(span).attributes[GEN_AI_CONVERSATION_ID];
    const conversationId = typeof ownId === 'string' ? ownId : ancestors[0]?.conversationId;
    if (conversationId && conversationId !== ownId) {
      span.setAttribute(GEN_AI_CONVERSATION_ID, conversationId);
    }

    const run: LangChainRun = { span, parentRunId, activeSpan, conversationId };
    trackRun(runId, run);
    if (conversationId) {
      for (const ancestor of ancestors) {
        if (ancestor.conversationId) {
          break;
        }
        ancestor.conversationId = conversationId;
        ancestor.span.setAttribute(GEN_AI_CONVERSATION_ID, conversationId);
      }
    }
    return run;
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
      parentRunId?: string,
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

      startRunSpan(runId, parentRunId, () =>
        startInactiveSpan({
          // With span streaming, omit the `'unknown'` model sentinel so the name stays low-cardinality.
          name:
            (typeof modelName === 'string' && modelName !== 'unknown') || !(client && hasSpanStreamingEnabled(client))
              ? `${operationName} ${modelName}`
              : operationName,
          attributes: {
            ...getAgentNameFromMetadata(metadata),
            ...getConversationIdFromMetadata(metadata),
            ...attributes,
            [SENTRY_OP]: GEN_AI_CHAT,
          },
        }),
      );
    },

    // Chat Model Start Handler
    handleChatModelStart(
      llm: unknown,
      messages: unknown,
      runId: string,
      parentRunId?: string,
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

      const toolDefsJson = recordInputs ? extractToolDefinitions(extraParams) : undefined;
      if (toolDefsJson) {
        attributes[GEN_AI_TOOL_DEFINITIONS] = toolDefsJson;
      }

      const modelName = attributes[GEN_AI_REQUEST_MODEL] || 'unknown';
      const operationName =
        typeof attributes[GEN_AI_OPERATION_NAME] === 'string' ? attributes[GEN_AI_OPERATION_NAME] : 'unknown';
      const client = getClient();

      startRunSpan(runId, parentRunId, () =>
        startInactiveSpan({
          // With span streaming, omit the `'unknown'` model sentinel so the name stays low-cardinality.
          name:
            (typeof modelName === 'string' && modelName !== 'unknown') || !(client && hasSpanStreamingEnabled(client))
              ? `${operationName} ${modelName}`
              : operationName,
          attributes: {
            ...getAgentNameFromMetadata(metadata),
            ...getConversationIdFromMetadata(metadata),
            ...attributes,
            [SENTRY_OP]: GEN_AI_CHAT,
          },
        }),
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
      const span = runs.get(runId)?.span;
      if (span?.isRecording()) {
        const attributes = extractLlmResponseAttributes(output as LangChainLLMResult, recordOutputs);
        if (attributes) {
          span.setAttributes(attributes);
        }
      }
      exitSpan(runId);
    },

    // LLM Error Handler - note: handleLLMError with capital LLM
    handleLLMError(_error: Error, runId: string) {
      // The error is surfaced to the caller (invoke() rejects), so we only mark the span failed and
      // do not record it.
      const span = runs.get(runId)?.span;
      if (span?.isRecording()) {
        span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
      }
      exitSpan(runId);
    },

    // Chain Start Handler
    handleChainStart(
      chain: { name?: string },
      inputs: Record<string, unknown>,
      runId: string,
      parentRunId?: string,
      _tags?: string[],
      metadata?: Record<string, unknown>,
      _runType?: string,
      runName?: string,
    ) {
      // A Jev call is a real model call, so it is recorded inside an agent too.
      if (isTypeSafeClassifier(chain)) {
        startRunSpan(runId, parentRunId, () =>
          startTypeSafeClassifierSpan(chain, inputs, metadata, recordInputs),
        ).decide = true;
        return;
      }

      // Skip chain spans when inside an agent context (createReactAgent).
      // The agent already creates an invoke_agent span; internal chain steps
      // (ChannelWrite, Branch, prompt, etc.) are noise.
      if (metadata?.__sentry_langgraph__) {
        return;
      }

      const chainName = runName || chain.name;
      const attributes: Record<string, SpanAttributeValue> = {
        ...getConversationIdFromMetadata(metadata),
        [SENTRY_ORIGIN]: 'auto.ai.langchain',
        [GEN_AI_OPERATION_NAME]: 'invoke_agent',
      };

      if (chainName) {
        attributes[GEN_AI_PIPELINE_NAME] = chainName;
      }

      if (recordInputs) {
        attributes['langchain.chain.inputs'] = JSON.stringify(inputs);
      }

      const client = getClient();

      startRunSpan(runId, parentRunId, () =>
        startInactiveSpan({
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
        }),
      );
    },

    // Chain End Handler
    handleChainEnd(outputs: unknown, runId: string) {
      const run = runs.get(runId);
      const span = run?.span;
      if (span?.isRecording()) {
        if (run?.decide) {
          addTypeSafeClassifierResponseAttributes(span, outputs, recordOutputs);
        } else if (recordOutputs) {
          span.setAttributes({
            'langchain.chain.outputs': JSON.stringify(outputs),
          });
        }
      }
      exitSpan(runId);
    },

    // Chain Error Handler
    handleChainError(_error: Error, runId: string) {
      // The error is surfaced to the caller (invoke() rejects), so we only mark the span failed and
      // do not record it.
      const span = runs.get(runId)?.span;
      if (span?.isRecording()) {
        span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
      }
      exitSpan(runId);
    },

    // Tool Start Handler
    handleToolStart(
      tool: { name?: string },
      input: string,
      runId: string,
      parentRunId?: string,
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
        ...getConversationIdFromMetadata(metadata),
        [SENTRY_ORIGIN]: LANGCHAIN_ORIGIN,
        [GEN_AI_OPERATION_NAME]: 'execute_tool',
        [GEN_AI_TOOL_NAME]: toolName,
      };

      if (recordInputs) {
        attributes[GEN_AI_TOOL_CALL_ARGUMENTS] = input;
      }

      startRunSpan(runId, parentRunId, () =>
        startInactiveSpan({
          name: `execute_tool ${toolName}`,
          attributes: {
            ...attributes,
            [SENTRY_OP]: GEN_AI_EXECUTE_TOOL,
          },
        }),
      );
    },

    // Tool End Handler
    handleToolEnd(output: unknown, runId: string) {
      const span = runs.get(runId)?.span;
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
      }
      exitSpan(runId);
    },

    // Tool Error Handler
    handleToolError(_error: Error, runId: string) {
      // The error is surfaced to the caller (invoke() rejects), so we only mark the span failed and
      // do not record it.
      const span = runs.get(runId)?.span;
      if (span?.isRecording()) {
        span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
      }
      exitSpan(runId);
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
