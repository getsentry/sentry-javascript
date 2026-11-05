import { stringify } from '@sentry/core';
import type { Span, SpanAttributes } from '@sentry/core';
import {
  GEN_AI_AGENT_NAME,
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_PIPELINE_NAME,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_SYSTEM_INSTRUCTIONS,
  GEN_AI_TOOL_DEFINITIONS,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { GEN_AI_INVOKE_AGENT } from '@sentry/conventions/op';
import { extractSystemInstructions } from '../core/utils';
import type { BaseChatModel, LangChainMessage } from '../langchain/types';
import {
  _INTERNAL_mergeLangChainCallbackHandler,
  getConversationIdFromMetadata,
  getConversationIdMetadataFromConfig,
  getInheritedLangChainCallbacks,
  normalizeLangChainMessages,
} from '../langchain/utils';
import { LANGGRAPH_ORIGIN } from './constants';
import type { CompiledGraph, LangGraphOptions } from './types';
import { extractToolsFromCompiledGraph } from './utils';

// LangGraph's invoke() calls this.stream() before its first await, so a graph set only for that synchronous
// stretch marks exactly invoke's own stream() call. A stream() started later in the run gets its own span.
let invokingGraph: object | undefined;

/** Runs the original invoke() of `graph`, so its internal stream() call can be recognised. */
export function callInvoke<T>(graph: object, invoke: () => T): T {
  const previous = invokingGraph;
  invokingGraph = graph;
  try {
    return invoke();
  } finally {
    invokingGraph = previous;
  }
}

/** Whether this stream() call on `graph` is the one its invoke() makes internally. */
export function isInvokeInternalStream(graph: object): boolean {
  return invokingGraph === graph;
}

/** Name and initial attributes of an agent span, from the call's config. */
export function getAgentSpanOptions(
  args: unknown[],
  extraAttributes?: SpanAttributes,
): { name: string; attributes: SpanAttributes } {
  const config = args.length > 1 ? (args[1] as Record<string, unknown> | undefined) : undefined;
  return {
    name: 'invoke_agent',
    attributes: {
      // Set before `spanStart`, so an id from `Sentry.setConversationId()` wins, as on the child spans
      ...getConversationIdFromMetadata(config?.configurable as Record<string, unknown> | undefined),
      [SENTRY_ORIGIN]: LANGGRAPH_ORIGIN,
      [SENTRY_OP]: GEN_AI_INVOKE_AGENT,
      [GEN_AI_OPERATION_NAME]: 'invoke_agent',
      ...extraAttributes,
    },
  };
}

/** Sets the request attributes on an agent span and injects the callback handler into the call's config. */
export function prepareAgentSpan(
  span: Span,
  args: unknown[],
  graphInstance: CompiledGraph,
  compileOptions: Record<string, unknown>,
  options: LangGraphOptions,
  llm: BaseChatModel | null | undefined,
  sentryCallbackHandler: unknown,
): LangChainMessage[] | null {
  const graphName = compileOptions?.name;

  if (graphName && typeof graphName === 'string') {
    span.setAttribute(GEN_AI_PIPELINE_NAME, graphName);
    span.setAttribute(GEN_AI_AGENT_NAME, graphName);
    span.updateName(`invoke_agent ${graphName}`);
  }

  const modelName = llm?.modelName ?? llm?.model;
  if (modelName) {
    span.setAttribute(GEN_AI_REQUEST_MODEL, modelName);
  }

  // A copy, so nothing is written back to a config object the caller reuses for other calls.
  const config: Record<string, unknown> = { ...(args[1] as Record<string, unknown> | undefined) };
  args[1] = config;
  // Explicit callbacks replace the parent run's, which LangChain would otherwise inherit.
  const callbacks = config.callbacks ?? getInheritedLangChainCallbacks();
  if (callbacks) {
    config.callbacks = callbacks;
  }

  if (sentryCallbackHandler) {
    const existingMetadata = (config.metadata ?? {}) as Record<string, unknown>;
    config.metadata = {
      ...getConversationIdMetadataFromConfig(config),
      ...existingMetadata,
      __sentry_langgraph__: true,
      ...(typeof graphName === 'string' ? { lc_agent_name: graphName } : {}),
    };

    config.callbacks = _INTERNAL_mergeLangChainCallbackHandler(config.callbacks, sentryCallbackHandler);
  }

  const recordInputs = options.recordInputs;

  const tools = recordInputs ? extractToolsFromCompiledGraph(graphInstance) : null;
  if (tools) {
    span.setAttribute(GEN_AI_TOOL_DEFINITIONS, JSON.stringify(tools));
  }

  // Custom state annotations have no `messages` array, the whole state is recorded instead.
  const inputState = args[0] as { messages?: LangChainMessage[]; lg_name?: string } | null | undefined;
  const inputMessages = Array.isArray(inputState?.messages) ? inputState.messages : null;
  // `new Command({ resume })` resumes an interrupted run and carries no user turn (LangGraph
  // tags it `lg_name: 'Command'`), so skip it like a `null` resume rather than recording the
  // control object as a message nobody wrote.
  const isResumeCommand = inputState?.lg_name === 'Command';

  if (recordInputs) {
    if (inputMessages) {
      const normalizedMessages = normalizeLangChainMessages(inputMessages);
      const { systemInstructions, filteredMessages } = extractSystemInstructions(normalizedMessages);

      if (systemInstructions) {
        span.setAttribute(GEN_AI_SYSTEM_INSTRUCTIONS, systemInstructions);
      }

      span.setAttributes({
        [GEN_AI_INPUT_MESSAGES]: stringify(filteredMessages),
      });
    } else if (inputState && typeof inputState === 'object' && !isResumeCommand) {
      span.setAttribute(GEN_AI_INPUT_MESSAGES, stringify([{ role: 'user', content: stringify(inputState) }]));
    }
  }

  return inputMessages;
}
