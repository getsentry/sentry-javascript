import { getCurrentScope } from '../../currentScopes';
import { captureException } from '../../exports';
import { startSpan } from '../../tracing/trace';
import type { Span, SpanAttributeValue } from '../../types-hoist/span';
import {
  ANTHROPIC_AI_RESPONSE_TIMESTAMP_ATTRIBUTE,
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_PROMPT_ATTRIBUTE,
  GEN_AI_REQUEST_FREQUENCY_PENALTY_ATTRIBUTE,
  GEN_AI_REQUEST_MESSAGES_ATTRIBUTE,
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
  GEN_AI_REQUEST_STREAM_ATTRIBUTE,
  GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE,
  GEN_AI_REQUEST_TOP_K_ATTRIBUTE,
  GEN_AI_REQUEST_TOP_P_ATTRIBUTE,
  GEN_AI_RESPONSE_ID_ATTRIBUTE,
  GEN_AI_RESPONSE_MODEL_ATTRIBUTE,
  GEN_AI_RESPONSE_TEXT_ATTRIBUTE,
  GEN_AI_SYSTEM_ATTRIBUTE,
} from '../ai/gen-ai-attributes';
import { buildMethodPath, getFinalOperationName, getSpanOperation, setTokenUsageAttributes } from '../ai/utils';
import { ANTHROPIC_AI_INTEGRATION_NAME } from './constants';
import type {
  AnthropicAiClient,
  AnthropicAiInstrumentedMethod,
  AnthropicAiIntegration,
  AnthropicAiOptions,
  AnthropicAiResponse,
} from './types';
import { shouldInstrument } from './utils';

/**
 * Extract request attributes from method arguments
 */
function extractRequestAttributes(args: unknown[], methodPath: string): Record<string, unknown> {
  const attributes: Record<string, unknown> = {
    [GEN_AI_SYSTEM_ATTRIBUTE]: 'anthropic',
    [GEN_AI_OPERATION_NAME_ATTRIBUTE]: getFinalOperationName(methodPath),
  };

  if (args.length > 0 && typeof args[0] === 'object' && args[0] !== null) {
    const params = args[0] as Record<string, unknown>;

    attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE] = params.model ?? 'unknown';
    if ('temperature' in params) attributes[GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE] = params.temperature;
    if ('top_p' in params) attributes[GEN_AI_REQUEST_TOP_P_ATTRIBUTE] = params.top_p;
    if ('stream' in params) attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE] = params.stream;
    if ('top_k' in params) attributes[GEN_AI_REQUEST_TOP_K_ATTRIBUTE] = params.top_k;
    attributes[GEN_AI_REQUEST_FREQUENCY_PENALTY_ATTRIBUTE] = params.frequency_penalty;
  } else {
    attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE] = 'unknown';
  }

  return attributes;
}

/**
 * Add private request attributes to spans.
 * This is only recorded if recordInputs is true.
 */
function addPrivateRequestAttributes(span: Span, params: Record<string, unknown>): void {
  if ('messages' in params) {
    span.setAttributes({ [GEN_AI_REQUEST_MESSAGES_ATTRIBUTE]: JSON.stringify(params.messages) });
  }
  if ('input' in params) {
    span.setAttributes({ [GEN_AI_REQUEST_MESSAGES_ATTRIBUTE]: JSON.stringify(params.input) });
  }
  if ('prompt' in params) {
    span.setAttributes({ [GEN_AI_PROMPT_ATTRIBUTE]: JSON.stringify(params.prompt) });
  }
}

/**
 * Add response attributes to spans
 */
function addResponseAttributes(span: Span, response: AnthropicAiResponse, recordOutputs?: boolean): void {
  if (!response || typeof response !== 'object') return;

  // Private response attributes that are only recorded if recordOutputs is true.
  if (recordOutputs) {
    // Messages.create
    if ('content' in response) {
      span.setAttributes({ [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: response.content });
    }
    // Completions.create
    if ('completion' in response) {
      span.setAttributes({ [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: response.completion });
    }
    // Models.countTokens
    if ('input_tokens' in response) {
      span.setAttributes({ [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: JSON.stringify(response.input_tokens) });
    }
  }

  span.setAttributes({
    [GEN_AI_RESPONSE_ID_ATTRIBUTE]: response.id,
  });
  span.setAttributes({
    [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: response.model,
  });
  span.setAttributes({
    [ANTHROPIC_AI_RESPONSE_TIMESTAMP_ATTRIBUTE]: new Date(response.created * 1000).toISOString(),
  });

  if (response.usage) {
    setTokenUsageAttributes(
      span,
      response.usage.input_tokens,
      response.usage.output_tokens,
      response.usage.cache_creation_input_tokens,
      response.usage.cache_read_input_tokens,
    );
  }
}

/**
 * Get record options from the integration
 */
function getOptionsFromIntegration(): AnthropicAiOptions {
  const scope = getCurrentScope();
  const client = scope.getClient();
  const integration = client?.getIntegrationByName(ANTHROPIC_AI_INTEGRATION_NAME) as AnthropicAiIntegration | undefined;
  const shouldRecordInputsAndOutputs = integration ? Boolean(client?.getOptions().sendDefaultPii) : false;

  return {
    recordInputs: integration?.options?.recordInputs ?? shouldRecordInputsAndOutputs,
    recordOutputs: integration?.options?.recordOutputs ?? shouldRecordInputsAndOutputs,
  };
}

/**
 * Instrument a method with Sentry spans
 * Following Sentry AI Agents Manual Instrumentation conventions
 * @see https://docs.sentry.io/platforms/javascript/guides/node/tracing/instrumentation/ai-agents-module/#manual-instrumentation
 */
function instrumentMethod<T extends unknown[], R>(
  originalMethod: (...args: T) => Promise<R>,
  methodPath: AnthropicAiInstrumentedMethod,
  context: unknown,
  options?: AnthropicAiOptions,
): (...args: T) => Promise<R> {
  return async function instrumentedMethod(...args: T): Promise<R> {
    const finalOptions = options || getOptionsFromIntegration();
    const requestAttributes = extractRequestAttributes(args, methodPath);
    const model = requestAttributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE] ?? 'unknown';
    const operationName = getFinalOperationName(methodPath);

    // TODO: Handle streaming responses
    return startSpan(
      {
        name: `${operationName} ${model}`,
        op: getSpanOperation(methodPath),
        attributes: requestAttributes as Record<string, SpanAttributeValue>,
      },
      async (span: Span) => {
        try {
          if (finalOptions.recordInputs && args[0] && typeof args[0] === 'object') {
            addPrivateRequestAttributes(span, args[0] as Record<string, unknown>);
          }

          const result = await originalMethod.apply(context, args);
          addResponseAttributes(span, result, finalOptions.recordOutputs);
          return result;
        } catch (error) {
          captureException(error);
          throw error;
        }
      },
    );
  };
}

/**
 * Create a deep proxy for Anthropic AI client instrumentation
 */
function createDeepProxy<T extends AnthropicAiClient>(target: T, currentPath = '', options?: AnthropicAiOptions): T {
  return new Proxy(target, {
    get(obj: object, prop: string): unknown {
      const value = (obj as Record<string, unknown>)[prop];
      const methodPath = buildMethodPath(currentPath, String(prop));
      // eslint-disable-next-line no-console
      console.log('value ----->>>>', value);

      if (typeof value === 'function' && shouldInstrument(methodPath)) {
        return instrumentMethod(value as (...args: unknown[]) => Promise<unknown>, methodPath, obj, options);
      }

      if (typeof value === 'function') {
        // Bind non-instrumented functions to preserve the original `this` context,
        // which is required for accessing private class fields (e.g. #baseURL) in OpenAI SDK v5.
        return value.bind(obj);
      }

      if (value && typeof value === 'object') {
        return createDeepProxy(value as object, methodPath, options);
      }

      return value;
    },
  }) as T;
}

/**
 * Instrument an Anthropic AI client with Sentry tracing
 * Can be used across Node.js, Cloudflare Workers, and Vercel Edge
 *
 * @template T - The type of the client that extends AnthropicAiClient
 * @param client - The Anthropic AI client to instrument
 * @param options - Optional configuration for recording inputs and outputs
 * @returns The instrumented client with the same type as the input
 */
export function instrumentAnthropicAiClient<T extends AnthropicAiClient>(client: T, options?: AnthropicAiOptions): T {
  return createDeepProxy(client, '', options);
}
