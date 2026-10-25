import { captureException, SPAN_STATUS_ERROR, startInactiveSpan, stringify, withActiveSpan } from '@sentry/core';
import {
  GEN_AI_AGENT_NAME,
  GEN_AI_CONVERSATION_ID,
  GEN_AI_OPERATION_NAME,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_RESPONSE_FINISH_REASONS,
  GEN_AI_RESPONSE_ID,
  GEN_AI_RESPONSE_MODEL,
  GEN_AI_RESPONSE_STREAMING,
  GEN_AI_TOOL_CALL_ARGUMENTS,
  GEN_AI_TOOL_CALL_RESULT,
  GEN_AI_TOOL_DESCRIPTION,
  GEN_AI_TOOL_NAME,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { GEN_AI_TOOL_CALL_ID_ATTRIBUTE } from '../core/gen-ai-attributes';
import type { GenAiOptions } from '../core/utils';
import { getGenAiSpanOp, resolveAIRecordingOptions } from '../core/utils';
import { TANSTACK_AI_MIDDLEWARE_BRAND, TANSTACK_AI_ORIGIN } from './constants';
import type { TanstackAiChatMiddleware, TanstackAiFetch, TanstackAiMiddlewareContext, TanstackAiTool } from './types';
import type { RunState } from './utils';
import {
  addUsage,
  endChatSpan,
  endSpan,
  getProviderName,
  inputAttributes,
  setOutputMessages,
  startChatSpan,
  usageAttributes,
} from './utils';

export type TanstackAiOptions = GenAiOptions;

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

  const endRun = (ctx: TanstackAiMiddlewareContext, errorStatus?: string): void => {
    const run = runs.get(ctx);
    if (!run) {
      return;
    }
    runs.delete(ctx);

    for (const span of run.toolSpans.values()) {
      endSpan(span, errorStatus);
    }
    endChatSpan(run, errorStatus);
    run.agentSpan.setAttributes(usageAttributes(run.usage));
    endSpan(run.agentSpan, errorStatus);
  };

  return {
    name: 'sentry',
    [TANSTACK_AI_MIDDLEWARE_BRAND]: true,

    onConfig(ctx, config) {
      // TanStack runs the `init` phase once per `chat()` call, before `onStart` and before any tool can run, so the
      // run starts here and its tools get the span of their call from the start.
      if (ctx.phase === 'init' && ctx.activity === 'chat') {
        const { recordInputs, recordOutputs } = resolveAIRecordingOptions(options);
        const agentName = ctx.subagentName;
        runs.set(ctx, {
          agentSpan: startInactiveSpan({
            name: agentName ? `invoke_agent ${agentName}` : 'invoke_agent',
            op: getGenAiSpanOp('invoke_agent'),
            attributes: {
              [SENTRY_ORIGIN]: TANSTACK_AI_ORIGIN,
              [GEN_AI_OPERATION_NAME]: 'invoke_agent',
              [GEN_AI_PROVIDER_NAME]: getProviderName(ctx),
              [GEN_AI_REQUEST_MODEL]: ctx.model,
              [GEN_AI_CONVERSATION_ID]: ctx.threadId,
              [GEN_AI_RESPONSE_STREAMING]: ctx.streaming,
              ...(agentName ? { [GEN_AI_AGENT_NAME]: agentName } : {}),
              ...(recordInputs ? inputAttributes(config.messages, config.systemPrompts) : {}),
            },
          }),
          recordInputs,
          recordOutputs,
          outputText: '',
          outputToolCalls: [],
          toolCallNames: new Map(),
          usage: {},
          toolSpans: new Map(),
          wrappedTools: new WeakMap(),
        });
      }

      const run = runs.get(ctx);
      if (!run) {
        return undefined;
      }
      const tools = config.tools.some(tool => run.wrappedTools.get(tool) !== tool)
        ? config.tools.map(tool => wrapTool(run, tool))
        : undefined;
      // `beforeModel` opens each agent-loop model call; `structuredOutput` the separate final call
      // made for `outputSchema`.
      if (ctx.phase !== 'beforeModel' && ctx.phase !== 'structuredOutput') {
        return tools ? { tools } : undefined;
      }

      // A model call that completes ends its span at the `afterModel` boundary. A span that is still open here
      // belongs to a call that failed and that a middleware retried with `ctx.retry()`.
      endChatSpan(run, 'internal_error');
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
      if (!run) {
        return;
      }
      if (chunk.type === 'RUN_FINISHED' || chunk.type === 'RUN_ERROR') {
        // TanStack sets the call metadata of the `structuredOutput` call only after `onConfig`.
        const provider = getProviderName(ctx);
        run.chatSpan?.setAttribute(GEN_AI_PROVIDER_NAME, provider);
        run.agentSpan.setAttribute(GEN_AI_PROVIDER_NAME, provider);
      }
      // A provider error ends the run with this chunk. `chat({ stream: false })` throws on it and stops
      // reading, so TanStack calls no terminal hook.
      if (chunk.type === 'RUN_ERROR') {
        endRun(ctx, ctx.signal?.aborted ? 'cancelled' : 'internal_error');
        return;
      }
      // A run that pauses at an interrupt ends with this chunk. For an interrupt at `beforeModel` or
      // `afterModel`, TanStack calls no terminal hook.
      if (chunk.type === 'RUN_FINISHED' && chunk.outcome?.type === 'interrupt') {
        endRun(ctx);
        return;
      }
      const span = run.chatSpan;
      if (!span) {
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
        // An adapter can report these only in the chunk's `metadata.tanstack`. TanStack copies them
        // into `callMetadata` before middleware sees the chunk.
        const responseModel = chunk.model ?? ctx.callMetadata?.model;
        const responseId = chunk.responseId ?? ctx.callMetadata?.responseId;
        if (chunk.finishReason) {
          span.setAttribute(GEN_AI_RESPONSE_FINISH_REASONS, stringify([chunk.finishReason]));
        }
        // The agent span keeps the response of the last model call, which is the answer of the run.
        for (const target of [span, run.agentSpan]) {
          if (responseModel) {
            target.setAttribute(GEN_AI_RESPONSE_MODEL, responseModel);
          }
          if (responseId) {
            target.setAttribute(GEN_AI_RESPONSE_ID, responseId);
          }
          setOutputMessages(target, run, chunk.finishReason ?? undefined);
        }
      }
    },

    // Runs after each model call, before the tools that it asked for, so the `chat` span does not cover them.
    onInterruptBoundary(ctx) {
      const run = runs.get(ctx);
      if (run && ctx.phase === 'afterModel') {
        endChatSpan(run);
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

    // Guards run after every `onBeforeToolCall` decision and after the input check, so `args` are the
    // arguments the tool gets. A `transformArgs` decision of an earlier middleware ends the `onBeforeToolCall`
    // chain, but not the guards.
    onGuardToolCall(ctx, { toolName, toolCallId, args, tool }) {
      const run = runs.get(ctx);
      // A client tool runs in the browser, not here, so there is nothing to time.
      if (!run || (tool && typeof tool.execute !== 'function')) {
        return;
      }

      run.toolSpans.set(
        toolCallId,
        startInactiveSpan({
          name: `execute_tool ${toolName}`,
          op: getGenAiSpanOp('execute_tool'),
          parentSpan: run.agentSpan,
          attributes: {
            [SENTRY_ORIGIN]: TANSTACK_AI_ORIGIN,
            [GEN_AI_OPERATION_NAME]: 'execute_tool',
            [GEN_AI_TOOL_NAME]: toolName,
            [GEN_AI_TOOL_CALL_ID_ATTRIBUTE]: toolCallId,
            [GEN_AI_CONVERSATION_ID]: ctx.threadId,
            ...(tool?.description ? { [GEN_AI_TOOL_DESCRIPTION]: tool.description } : {}),
            ...(run.recordInputs ? { [GEN_AI_TOOL_CALL_ARGUMENTS]: stringify(args) } : {}),
          },
        }),
      );
    },

    onAfterToolCall(ctx, { toolCallId, ok, result, error }) {
      const run = runs.get(ctx);
      const span = run?.toolSpans.get(toolCallId);
      if (!run || !span) {
        return;
      }
      run.toolSpans.delete(toolCallId);

      if (run.recordOutputs && ok && result !== undefined) {
        span.setAttribute(GEN_AI_TOOL_CALL_RESULT, typeof result === 'string' ? result : stringify(result));
      }
      if (!ok && ctx.signal?.aborted) {
        // TanStack fails each tool that has not started yet with an `Operation aborted` error.
        span.setStatus({ code: SPAN_STATUS_ERROR, message: 'cancelled' });
      } else if (!ok) {
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

    // As in the other AI integrations, an aborted call counts as failed.
    onAbort(ctx) {
      endRun(ctx, 'cancelled');
    },

    onError(ctx) {
      endRun(ctx, 'internal_error');
    },
  };
}

// TanStack runs `execute` outside any of the middleware hooks, so wrapping it is the only way to make the
// tool span active while the tool runs and have the tool's own spans nest under it.
function wrapTool(run: RunState, tool: TanstackAiTool): TanstackAiTool {
  const known = run.wrappedTools.get(tool);
  if (known) {
    return known;
  }
  const { execute } = tool;
  const wrapped: TanstackAiTool =
    typeof execute === 'function'
      ? {
          ...tool,
          execute: (args, context) => {
            const span = context?.toolCallId ? run.toolSpans.get(context.toolCallId) : undefined;
            return span
              ? withActiveSpan(span, () => execute.call(tool, args, context))
              : execute.call(tool, args, context);
          },
        }
      : tool;
  run.wrappedTools.set(tool, wrapped);
  run.wrappedTools.set(wrapped, wrapped);
  return wrapped;
}
