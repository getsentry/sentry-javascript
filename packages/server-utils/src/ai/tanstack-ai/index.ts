import type { Span } from '@sentry/core';
import {
  _INTERNAL_shouldSkipAiProviderWrapping,
  _INTERNAL_skipAiProviderWrapping,
  captureException,
  SPAN_STATUS_ERROR,
  startInactiveSpan,
  stringify,
  withActiveSpan,
} from '@sentry/core';
import {
  GEN_AI_AGENT_NAME,
  GEN_AI_CONVERSATION_ID,
  GEN_AI_OPERATION_NAME,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_RESPONSE_FINISH_REASONS,
  GEN_AI_RESPONSE_MODEL,
  GEN_AI_RESPONSE_STREAMING,
  GEN_AI_TOOL_CALL_ARGUMENTS,
  GEN_AI_TOOL_CALL_RESULT,
  GEN_AI_TOOL_DESCRIPTION,
  GEN_AI_TOOL_NAME,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { ANTHROPIC_AI_INTEGRATION_NAME } from '../anthropic-ai/constants';
import type { GenAiOptions } from '../core/utils';
import { getGenAiSpanOp, resolveAIRecordingOptions } from '../core/utils';
import { GOOGLE_GENAI_INTEGRATION_NAME } from '../google-genai/constants';
import { OPENAI_INTEGRATION_NAME } from '../openai/constants';
import { TANSTACK_AI_MIDDLEWARE_BRAND, TANSTACK_AI_ORIGIN } from './constants';
import type { TanstackAiChatMiddleware, TanstackAiFetch, TanstackAiMiddlewareContext, TanstackAiTool } from './types';
import type { RunState } from './utils';
import { addUsage, endChatSpan, setOutputMessages, startChatSpan, usageAttributes } from './utils';

export type TanstackAiOptions = GenAiOptions;

// TanStack's provider adapters call the vendor SDKs that Sentry instruments too, which would report
// each model call a second time beside our `chat` span.
const PROVIDER_INTEGRATIONS = [OPENAI_INTEGRATION_NAME, ANTHROPIC_AI_INTEGRATION_NAME, GOOGLE_GENAI_INTEGRATION_NAME];

/**
 * Create a `@tanstack/ai` chat middleware that records `invoke_agent`, `chat` and `execute_tool`
 * spans for a `chat()` call.
 *
 * ```js
 * chat({ adapter, messages, threadId, middleware: [Sentry.createTanstackAiMiddleware()] });
 * ```
 */
export function createTanstackAiMiddleware(options: TanstackAiOptions = {}): TanstackAiChatMiddleware {
  // Keyed by the middleware context, which TanStack creates once per `chat()` call.
  const runs = new WeakMap<TanstackAiMiddlewareContext, RunState>();
  // Tool call ids are unique per call, so one map serves every run this middleware sees.
  const toolSpans = new Map<string, Span>();
  const wrappedTools = new WeakMap<TanstackAiTool, TanstackAiTool>();

  // TanStack runs `execute` outside any of the middleware hooks, so wrapping it is the only way to
  // make the tool span active while the tool runs and have the tool's own spans nest under it.
  const wrapTool = (tool: TanstackAiTool): TanstackAiTool => {
    const known = wrappedTools.get(tool);
    if (known) {
      return known;
    }
    const { execute } = tool;
    if (typeof execute !== 'function') {
      wrappedTools.set(tool, tool);
      return tool;
    }
    const wrapped: TanstackAiTool = {
      ...tool,
      execute: (args, context) => {
        const span = context?.toolCallId ? toolSpans.get(context.toolCallId) : undefined;
        return span ? withActiveSpan(span, () => execute.call(tool, args, context)) : execute.call(tool, args, context);
      },
    };
    wrappedTools.set(tool, wrapped);
    wrappedTools.set(wrapped, wrapped);
    return wrapped;
  };

  const endRun = (ctx: TanstackAiMiddlewareContext, error?: unknown): void => {
    const run = runs.get(ctx);
    if (!run) {
      return;
    }
    runs.delete(ctx);

    for (const id of run.toolCallIds) {
      toolSpans.get(id)?.end();
      toolSpans.delete(id);
    }
    endChatSpan(run, error);

    run.agentSpan.setAttributes(usageAttributes(run.usage));
    if (error !== undefined) {
      run.agentSpan.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
    }
    run.agentSpan.end();
  };

  return {
    name: 'sentry',
    [TANSTACK_AI_MIDDLEWARE_BRAND]: true,

    onStart(ctx) {
      if (ctx.activity !== 'chat') {
        return;
      }
      if (!PROVIDER_INTEGRATIONS.every(name => _INTERNAL_shouldSkipAiProviderWrapping(name))) {
        _INTERNAL_skipAiProviderWrapping(PROVIDER_INTEGRATIONS);
      }

      const { recordInputs, recordOutputs } = resolveAIRecordingOptions(options);
      const agentName = ctx.subagentName;
      runs.set(ctx, {
        agentSpan: startInactiveSpan({
          name: agentName ? `invoke_agent ${agentName}` : 'invoke_agent',
          op: getGenAiSpanOp('invoke_agent'),
          attributes: {
            [SENTRY_ORIGIN]: TANSTACK_AI_ORIGIN,
            [GEN_AI_OPERATION_NAME]: 'invoke_agent',
            [GEN_AI_PROVIDER_NAME]: ctx.provider,
            [GEN_AI_REQUEST_MODEL]: ctx.model,
            [GEN_AI_CONVERSATION_ID]: ctx.threadId,
            [GEN_AI_RESPONSE_STREAMING]: ctx.streaming,
            ...(agentName ? { [GEN_AI_AGENT_NAME]: agentName } : {}),
          },
        }),
        recordInputs,
        recordOutputs,
        outputText: '',
        outputToolCalls: [],
        toolCallNames: new Map(),
        usage: {},
        toolCallIds: new Set(),
      });
    },

    onConfig(ctx, config) {
      const tools = config.tools.some(tool => wrappedTools.get(tool) !== tool) ? config.tools.map(wrapTool) : undefined;

      const run = runs.get(ctx);
      // `beforeModel` opens each agent-loop model call; `structuredOutput` the separate final call
      // made for `outputSchema`. `init` fires once before `onStart`, with no run yet.
      if (!run || (ctx.phase !== 'beforeModel' && ctx.phase !== 'structuredOutput')) {
        return tools ? { tools } : undefined;
      }

      endChatSpan(run);
      const chatSpan = startChatSpan(ctx, config, run);
      run.chatSpan = chatSpan;

      return {
        ...(tools ? { tools } : {}),
        // Chains inside any wrapper set before us, so the provider request (and the HTTP span the
        // SDK records for it) runs with the `chat` span active.
        wrapFetch:
          (next: TanstackAiFetch): TanstackAiFetch =>
          (input, init) =>
            withActiveSpan(chatSpan, () => next(input, init)),
      };
    },

    onChunk(ctx, chunk) {
      const run = runs.get(ctx);
      const span = run?.chatSpan;
      if (!run || !span) {
        return;
      }

      if (chunk.type === 'TEXT_MESSAGE_CONTENT' && run.recordOutputs && chunk.delta) {
        run.outputText += chunk.delta;
      } else if (chunk.type === 'TOOL_CALL_START' && chunk.toolCallId && chunk.toolCallName) {
        run.toolCallNames.set(chunk.toolCallId, chunk.toolCallName);
      } else if (chunk.type === 'TOOL_CALL_END' && run.recordOutputs && chunk.toolCallId) {
        run.outputToolCalls.push({
          type: 'tool_call',
          id: chunk.toolCallId,
          name: run.toolCallNames.get(chunk.toolCallId),
          arguments: stringify(chunk.input ?? {}),
        });
      } else if (chunk.type === 'RUN_FINISHED') {
        if (chunk.model) {
          span.setAttribute(GEN_AI_RESPONSE_MODEL, chunk.model);
        }
        if (chunk.finishReason) {
          span.setAttribute(GEN_AI_RESPONSE_FINISH_REASONS, stringify([chunk.finishReason]));
        }
        setOutputMessages(span, run, chunk.finishReason ?? undefined);
      }
    },

    onUsage(ctx, usage) {
      const run = runs.get(ctx);
      if (!run) {
        return;
      }
      run.chatSpan?.setAttributes(usageAttributes(usage));
      run.usage = addUsage(run.usage, usage);
    },

    onBeforeToolCall(ctx, { toolName, toolCallId, args, tool }) {
      const run = runs.get(ctx);
      // A client tool runs in the browser, not here, so there is nothing to time.
      if (!run || (tool && typeof tool.execute !== 'function')) {
        return;
      }

      run.toolCallIds.add(toolCallId);
      toolSpans.set(
        toolCallId,
        startInactiveSpan({
          name: `execute_tool ${toolName}`,
          op: getGenAiSpanOp('execute_tool'),
          parentSpan: run.agentSpan,
          attributes: {
            [SENTRY_ORIGIN]: TANSTACK_AI_ORIGIN,
            [GEN_AI_OPERATION_NAME]: 'execute_tool',
            [GEN_AI_TOOL_NAME]: toolName,
            [GEN_AI_CONVERSATION_ID]: ctx.threadId,
            ...(tool?.description ? { [GEN_AI_TOOL_DESCRIPTION]: tool.description } : {}),
            ...(run.recordInputs ? { [GEN_AI_TOOL_CALL_ARGUMENTS]: stringify(args) } : {}),
          },
        }),
      );
    },

    onAfterToolCall(ctx, { toolCallId, ok, result, error }) {
      const span = toolSpans.get(toolCallId);
      if (!span) {
        return;
      }
      toolSpans.delete(toolCallId);
      const run = runs.get(ctx);
      run?.toolCallIds.delete(toolCallId);

      if (run?.recordOutputs && ok && result !== undefined) {
        span.setAttribute(GEN_AI_TOOL_CALL_RESULT, typeof result === 'string' ? result : stringify(result));
      }
      if (!ok) {
        span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
        // TanStack hands a tool failure back to the model as its result, so it never reaches the
        // app's error handlers.
        withActiveSpan(span, () => {
          captureException(error, { mechanism: { type: TANSTACK_AI_ORIGIN, handled: true } });
        });
      }
      span.end();
    },

    onFinish(ctx) {
      endRun(ctx);
    },

    onAbort(ctx) {
      endRun(ctx);
    },

    onError(ctx, { error }) {
      endRun(ctx, error);
    },
  };
}
