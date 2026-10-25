import type { Span } from '@sentry/core';
import {
  _INTERNAL_withAiProviderWrappingSkipped,
  isObjectLike,
  isThenable,
  SPAN_STATUS_ERROR,
  startInactiveSpan,
  stringify,
} from '@sentry/core';
import {
  GEN_AI_CONVERSATION_ID,
  GEN_AI_COST_TOTAL_TOKENS,
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MAX_TOKENS,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_REQUEST_TEMPERATURE,
  GEN_AI_REQUEST_TOP_P,
  GEN_AI_RESPONSE_STREAMING,
  GEN_AI_SYSTEM_INSTRUCTIONS,
  GEN_AI_TOOL_DEFINITIONS,
  GEN_AI_USAGE_REASONING_OUTPUT_TOKENS,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { AWS_BEDROCK_INTEGRATION_NAME } from '../../integrations/aws-sdk/constants';
import { ANTHROPIC_AI_INTEGRATION_NAME } from '../anthropic-ai/constants';
import { getGenAiSpanOp, getTokenUsageAttributes } from '../core/utils';
import { GOOGLE_GENAI_INTEGRATION_NAME } from '../google-genai/constants';
import { MISTRAL_INTEGRATION_NAME } from '../mistral/constants';
import { OPENAI_INTEGRATION_NAME } from '../openai/constants';
import { WORKERS_AI_INTEGRATION_NAME } from '../workers-ai/constants';
import { TANSTACK_AI_ORIGIN } from './constants';
import type {
  TanstackAiMiddlewareConfig,
  TanstackAiMiddlewareContext,
  TanstackAiModelMessage,
  TanstackAiTool,
  TanstackAiUsage,
} from './types';

/** What the middleware tracks for one `chat()` call. */
export interface RunState {
  agentSpan: Span;
  chatSpan?: Span;
  recordInputs: boolean;
  recordOutputs: boolean;
  outputText: string;
  outputToolCalls: Array<Record<string, unknown>>;
  // `TOOL_CALL_END` carries the parsed input but not the name, which only `TOOL_CALL_START` has.
  toolCallNames: Map<string, string>;
  usage: TanstackAiUsage;
  /** The open `execute_tool` spans of the run, keyed by tool call id. */
  toolSpans: Map<string, Span>;
  /** Each tool of the run mapped to the copy whose `execute` runs with the tool span active. */
  wrappedTools: WeakMap<TanstackAiTool, TanstackAiTool>;
}

// The Sentry instrumentations of the vendor SDKs and bindings that adapters call. Each one would report the
// model call of an adapter a second time beside our span.
const PROVIDER_INTEGRATIONS = [
  OPENAI_INTEGRATION_NAME,
  ANTHROPIC_AI_INTEGRATION_NAME,
  GOOGLE_GENAI_INTEGRATION_NAME,
  MISTRAL_INTEGRATION_NAME,
  // The Cloudflare adapter calls `env.AI.run()`, which `@sentry/cloudflare` instruments.
  WORKERS_AI_INTEGRATION_NAME,
  // The Bedrock adapters call `@aws-sdk/client-bedrock-runtime`, which `awsIntegration` instruments.
  AWS_BEDROCK_INTEGRATION_NAME,
];

type AdapterMethod = (...args: unknown[]) => unknown;

/**
 * The adapter, with the Sentry integrations of the vendor SDKs skipped during its calls, as our spans record
 * them. A direct call to the same SDK elsewhere in the app still gets its span.
 *
 * `onResult.callback` gets the value that the adapter method named `onResult.method` resolves to.
 */
export function skipProviderIntegrations<T>(
  adapter: T,
  onResult?: { method: string; callback: (result: unknown) => void },
): T {
  if (!isObjectLike(adapter)) {
    return adapter;
  }
  const skipped = <R>(callback: () => R): R => _INTERNAL_withAiProviderWrappingSkipped(PROVIDER_INTEGRATIONS, callback);
  // So that each read of a method returns the same function.
  const wrappedMethods = new WeakMap<AdapterMethod, AdapterMethod>();

  return new Proxy(adapter, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property);
      const descriptor = Reflect.getOwnPropertyDescriptor(target, property);
      // A Proxy must return a read-only, non-configurable property (e.g. of a frozen adapter) as it is.
      if (
        typeof value !== 'function' ||
        property === 'constructor' ||
        (descriptor && !descriptor.configurable && !descriptor.writable)
      ) {
        return value;
      }
      const known = wrappedMethods.get(value as AdapterMethod);
      if (known) {
        return known;
      }
      const callback = property === onResult?.method ? onResult.callback : undefined;
      const wrapped: AdapterMethod = (...args) => {
        const result: unknown = skipped(() => value.apply(target, args));
        // A text adapter returns an async generator, whose body runs on each `next()` in the async
        // context of the caller, which for a streamed `chat()` is the app's code.
        if (isAsyncIterable(result)) {
          return skipDuringIteration(result, skipped);
        }
        return callback && isThenable(result)
          ? result.then(resolved => {
              callback(resolved);
              return resolved;
            })
          : result;
      };
      wrappedMethods.set(value as AdapterMethod, wrapped);
      return wrapped;
    },
  });
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return isObjectLike(value) && typeof value[Symbol.asyncIterator] === 'function';
}

function skipDuringIteration<T>(
  iterable: AsyncIterable<T>,
  skipped: <R>(callback: () => R) => R,
): AsyncIterableIterator<T> {
  const iterator = iterable[Symbol.asyncIterator]();
  return {
    next: (...args) => skipped(() => iterator.next(...args)),
    return: value => skipped(() => iterator.return?.(value) ?? Promise.resolve({ done: true, value })),
    throw: error => skipped(() => iterator.throw?.(error) ?? Promise.reject(error)),
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}

/**
 * `ctx.provider` is the adapter name, which for some adapters also names the wire API (e.g.
 * `openrouter-responses`). The call metadata carries the adapter's provider identity, but only once the
 * first model call has started.
 */
export function getProviderName(ctx: TanstackAiMiddlewareContext): string {
  return ctx.callMetadata?.source?.provider ?? ctx.provider;
}

export function startChatSpan(
  ctx: TanstackAiMiddlewareContext,
  config: TanstackAiMiddlewareConfig,
  run: RunState,
): Span {
  const attributes: Record<string, string | number | boolean | undefined> = {
    [SENTRY_ORIGIN]: TANSTACK_AI_ORIGIN,
    [GEN_AI_OPERATION_NAME]: 'chat',
    [GEN_AI_PROVIDER_NAME]: getProviderName(ctx),
    [GEN_AI_REQUEST_MODEL]: ctx.model,
    [GEN_AI_CONVERSATION_ID]: ctx.threadId,
    [GEN_AI_RESPONSE_STREAMING]: ctx.streaming,
    ...requestAttributes(config.modelOptions),
  };

  // The `structuredOutput` call sends no tools, although its config lists them.
  if (run.recordInputs && config.tools.length && ctx.phase !== 'structuredOutput') {
    attributes[GEN_AI_TOOL_DEFINITIONS] = stringify(
      config.tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
    );
  }
  if (run.recordInputs) {
    // A middleware can send the provider other messages than the history of the run.
    Object.assign(attributes, inputAttributes(config.providerMessages ?? config.messages, config.systemPrompts));
  }

  run.outputText = '';
  run.outputToolCalls = [];
  run.toolCallNames.clear();
  return startInactiveSpan({
    name: `chat ${ctx.model}`,
    op: getGenAiSpanOp('chat'),
    parentSpan: run.agentSpan,
    attributes,
  });
}

export function inputAttributes(
  messages: ReadonlyArray<TanstackAiModelMessage>,
  systemPrompts: TanstackAiMiddlewareConfig['systemPrompts'],
): Record<string, string | undefined> {
  return {
    [GEN_AI_INPUT_MESSAGES]: stringify(messages.map(toGenAiMessage)),
    [GEN_AI_SYSTEM_INSTRUCTIONS]: systemPrompts.length
      ? systemPrompts.map(prompt => (typeof prompt === 'string' ? prompt : prompt.content)).join('\n')
      : undefined,
  };
}

export function endChatSpan(run: RunState, errorStatus?: string): void {
  const span = run.chatSpan;
  run.chatSpan = undefined;
  if (span) {
    endSpan(span, errorStatus);
  }
}

export function endSpan(span: Span, errorStatus?: string): void {
  if (errorStatus) {
    span.setStatus({ code: SPAN_STATUS_ERROR, message: errorStatus });
  }
  span.end();
}

export function setOutputMessages(span: Span, run: RunState, finishReason: string | undefined): void {
  const parts = [...(run.outputText ? [{ type: 'text', content: run.outputText }] : []), ...run.outputToolCalls];
  if (parts.length) {
    span.setAttribute(GEN_AI_OUTPUT_MESSAGES, stringify([{ role: 'assistant', parts, finish_reason: finishReason }]));
  }
}

/** TanStack's `ModelMessage` in the gen_ai conventions shape (`{ role, parts }`). */
function toGenAiMessage(message: TanstackAiModelMessage): Record<string, unknown> {
  const parts: Array<Record<string, unknown>> = [];
  const { content } = message;

  if (message.role === 'tool') {
    parts.push({ type: 'tool_call_response', id: message.toolCallId, result: content });
  } else if (typeof content === 'string') {
    parts.push({ type: 'text', content });
  } else if (Array.isArray(content)) {
    for (const part of content) {
      // Media parts carry inline bytes or provider handles; keep only their kind.
      parts.push(part.type === 'text' ? { type: 'text', content: part.content } : { type: part.type });
    }
  }
  for (const toolCall of message.toolCalls ?? []) {
    parts.push({
      type: 'tool_call',
      id: toolCall.id,
      name: toolCall.function?.name,
      arguments: toolCall.function?.arguments,
    });
  }
  return { role: message.role, parts };
}

/** Sampling options live in the provider-native `modelOptions`, so accept the common spellings. */
function requestAttributes(modelOptions: Record<string, unknown> = {}): Record<string, number | undefined> {
  const pick = (...keys: string[]): number | undefined => {
    for (const key of keys) {
      const value = modelOptions[key];
      if (typeof value === 'number') {
        return value;
      }
    }
    return undefined;
  };
  return {
    [GEN_AI_REQUEST_TEMPERATURE]: pick('temperature'),
    [GEN_AI_REQUEST_TOP_P]: pick('top_p', 'topP'),
    [GEN_AI_REQUEST_MAX_TOKENS]: pick('max_tokens', 'maxTokens', 'max_output_tokens', 'maxOutputTokens'),
  };
}

export function usageAttributes(usage: TanstackAiUsage): Record<string, number> {
  const attributes = getTokenUsageAttributes(
    usage.promptTokens,
    usage.completionTokens,
    usage.promptTokensDetails?.cacheWriteTokens,
    usage.promptTokensDetails?.cachedTokens,
    usage.totalTokens,
  );
  if (typeof usage.completionTokensDetails?.reasoningTokens === 'number') {
    attributes[GEN_AI_USAGE_REASONING_OUTPUT_TOKENS] = usage.completionTokensDetails.reasoningTokens;
  }
  // The provider's own figure (e.g. OpenRouter) includes cache discounts and gateway markup that a
  // price table cannot reproduce. With a BYOK key, OpenRouter reports only its fee as `cost` and the
  // provider's charge as `upstreamCost`. Relay keeps any cost it gets, so a 0 would replace the cost it
  // computes from the token counts.
  const cost = (usage.cost ?? 0) + (usage.costDetails?.upstreamCost ?? 0);
  if (cost > 0) {
    attributes[GEN_AI_COST_TOTAL_TOKENS] = cost;
  }
  return attributes;
}

export function addUsage(total: TanstackAiUsage, usage: TanstackAiUsage): TanstackAiUsage {
  const add = (a: number | undefined, b: number | undefined): number | undefined =>
    a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0);
  return {
    promptTokens: add(total.promptTokens, usage.promptTokens),
    completionTokens: add(total.completionTokens, usage.completionTokens),
    totalTokens: add(total.totalTokens, usage.totalTokens),
    cost: add(total.cost, usage.cost),
    costDetails: { upstreamCost: add(total.costDetails?.upstreamCost, usage.costDetails?.upstreamCost) },
    promptTokensDetails: {
      cachedTokens: add(total.promptTokensDetails?.cachedTokens, usage.promptTokensDetails?.cachedTokens),
      cacheWriteTokens: add(total.promptTokensDetails?.cacheWriteTokens, usage.promptTokensDetails?.cacheWriteTokens),
    },
    completionTokensDetails: {
      reasoningTokens: add(
        total.completionTokensDetails?.reasoningTokens,
        usage.completionTokensDetails?.reasoningTokens,
      ),
    },
  };
}
