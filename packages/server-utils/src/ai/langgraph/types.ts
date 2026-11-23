import type { GenAiSpanHooks } from '../core/span-hooks';
import type { GenAiCallOptions } from '../core/utils';

/**
 * The call that `recordInputs`/`recordOutputs` decide on, and that the span hooks get: an `invoke()` or `stream()`
 * call of a compiled graph.
 */
export interface LangGraphCallInfo {
  operation: 'invoke_agent';
  /** The graph input, the first argument of `invoke()`/`stream()` as passed. */
  input: unknown;
  /** The run config, the second argument of `invoke()`/`stream()` as passed. */
  config: Record<string, unknown> | undefined;
}

/**
 * Options for the LangGraph integration. Each `invoke()`/`stream()` call decides once, and the decision covers the
 * whole graph run, including its chat model and tool spans.
 *
 * The span hooks only run for the `invoke_agent` span of the call. `onSpanEnd` gets the final graph state: what
 * `invoke()` resolved with, or the output of the run for `stream()`, which is `undefined` when the caller stopped
 * reading early.
 */
export type LangGraphOptions = GenAiCallOptions<LangGraphCallInfo> & GenAiSpanHooks<LangGraphCallInfo>;

/**
 * LangGraph Tool definition from lc_kwargs
 */
export interface LangGraphToolDefinition {
  name?: string;
  description?: string;
  schema?: unknown;
  func?: (...args: unknown[]) => unknown;
}

/**
 * LangGraph Tool object (DynamicTool, DynamicStructuredTool, etc.)
 */
export interface LangGraphTool {
  [key: string]: unknown;
  lc_kwargs?: LangGraphToolDefinition;
  name?: string;
  description?: string;
}

/**
 * LangGraph ToolNode with tools array
 */
export interface ToolNode {
  [key: string]: unknown;
  tools?: LangGraphTool[];
}

/**
 * LangGraph PregelNode containing a ToolNode
 */
export interface PregelNode {
  [key: string]: unknown;
  runnable?: ToolNode;
}

/**
 * LangGraph StateGraph builder nodes
 */
export interface StateGraphNodes {
  [key: string]: unknown;
  tools?: PregelNode;
}

/**
 * LangGraph StateGraph builder
 */
export interface StateGraphBuilder {
  [key: string]: unknown;
  nodes?: StateGraphNodes;
}

/**
 * Basic interface for compiled graph
 */
export interface CompiledGraph {
  [key: string]: unknown;
  invoke?: (...args: unknown[]) => Promise<unknown>;
  stream?: (...args: unknown[]) => Promise<unknown>;
  name?: string;
  graph_name?: string;
  lc_kwargs?: {
    [key: string]: unknown;
    name?: string;
  };
  builder?: StateGraphBuilder;
}
