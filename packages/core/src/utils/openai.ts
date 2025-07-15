import type { Span, SpanAttributeValue } from '../types-hoist/span';
import { captureException } from '../exports';
import { getCurrentScope } from '../currentScopes';
import { startSpan } from '../tracing/trace';
import {
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_REQUEST_FREQUENCY_PENALTY_ATTRIBUTE,
  GEN_AI_REQUEST_MESSAGES_ATTRIBUTE,
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
  GEN_AI_REQUEST_PRESENCE_PENALTY_ATTRIBUTE,
  GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE,
  GEN_AI_REQUEST_TOP_P_ATTRIBUTE,
  GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE,
  GEN_AI_RESPONSE_ID_ATTRIBUTE,
  GEN_AI_RESPONSE_MODEL_ATTRIBUTE,
  GEN_AI_RESPONSE_TEXT_ATTRIBUTE,
  GEN_AI_SYSTEM_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE,
  OPENAI_RESPONSE_ID_ATTRIBUTE,
  OPENAI_RESPONSE_MODEL_ATTRIBUTE,
  OPENAI_RESPONSE_TIMESTAMP_ATTRIBUTE,
  OPENAI_USAGE_COMPLETION_TOKENS_ATTRIBUTE,
  OPENAI_USAGE_PROMPT_TOKENS_ATTRIBUTE,
} from './openai-attributes';
import type {
  OpenAiChatCompletionObject,
  OpenAiResponse,
  OpenAIResponseObject,
  OpenAiOptions,
  OpenAiClient,
  OpenAiIntegration,
  InstrumentedMethod,
} from './openai-types';
import {
  buildMethodPath,
  getOperationName,
  getSpanOperation,
  isChatCompletionResponse,
  isResponsesApiResponse,
  shouldInstrument,
} from './openai-utils';

/**
 * Extract request attributes from method arguments
 * Following Sentry's AI Agents conventions
 */
function extractRequestAttributes(args: unknown[], methodPath: string): Record<string, unknown> {
  const attributes: Record<string, unknown> = {
    [GEN_AI_SYSTEM_ATTRIBUTE]: 'openai',
    [GEN_AI_OPERATION_NAME_ATTRIBUTE]: getOperationName(methodPath),
  };

  if (args.length > 0 && args[0] && typeof args[0] === 'object') {
    const params = args[0] as Record<string, unknown>;

    attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE] = params.model || 'unknown';

    if (params.temperature !== undefined) {
      attributes[GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE] = params.temperature;
    }
    if (params.top_p !== undefined) {
      attributes[GEN_AI_REQUEST_TOP_P_ATTRIBUTE] = params.top_p;
    }

    if (params.frequency_penalty !== undefined) {
      attributes[GEN_AI_REQUEST_FREQUENCY_PENALTY_ATTRIBUTE] = params.frequency_penalty;
    }
    if (params.presence_penalty !== undefined) {
      attributes[GEN_AI_REQUEST_PRESENCE_PENALTY_ATTRIBUTE] = params.presence_penalty;
    }
  } else {
    // REQUIRED: Ensure model is always set even when no params provided
    attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE] = 'unknown';
  }

  return attributes;
}

/**
 * Helper function to set token usage attributes
 */
function setTokenUsageAttributes(
  span: Span,
  promptTokens?: number,
  completionTokens?: number,
  totalTokens?: number,
): void {
  if (promptTokens !== undefined) {
    span.setAttributes({
      [OPENAI_USAGE_PROMPT_TOKENS_ATTRIBUTE]: promptTokens,
      [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: promptTokens,
    });
  }
  if (completionTokens !== undefined) {
    span.setAttributes({
      [OPENAI_USAGE_COMPLETION_TOKENS_ATTRIBUTE]: completionTokens,
      [GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE]: completionTokens,
    });
  }
  if (totalTokens !== undefined) {
    span.setAttributes({
      [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: totalTokens,
    });
  }
}

/**
 * Helper function to set common response attributes (ID, model, timestamp)
 */
function setCommonResponseAttributes(span: Span, id?: string, model?: string, timestamp?: number): void {
  if (id) {
    span.setAttributes({
      [OPENAI_RESPONSE_ID_ATTRIBUTE]: id,
      [GEN_AI_RESPONSE_ID_ATTRIBUTE]: id,
    });
  }
  if (model) {
    span.setAttributes({
      [OPENAI_RESPONSE_MODEL_ATTRIBUTE]: model,
      [GEN_AI_RESPONSE_MODEL_ATTRIBUTE]: model,
    });
  }
  if (timestamp) {
    span.setAttributes({
      [OPENAI_RESPONSE_TIMESTAMP_ATTRIBUTE]: new Date(timestamp * 1000).toISOString(),
    });
  }
}

/**
 * Add attributes for Chat Completion responses
 */
function addChatCompletionAttributes(span: Span, response: OpenAiChatCompletionObject): void {
  setCommonResponseAttributes(span, response.id, response.model, response.created);

  if (response.usage) {
    setTokenUsageAttributes(
      span,
      response.usage.prompt_tokens,
      response.usage.completion_tokens,
      response.usage.total_tokens,
    );
  }

  // Finish reasons - must be stringified array
  if (response.choices && Array.isArray(response.choices)) {
    const finishReasons = response.choices.map(choice => choice.finish_reason).filter(reason => reason !== null);

    if (finishReasons.length > 0) {
      span.setAttributes({
        [GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]: JSON.stringify(finishReasons),
      });
    }
  }
}

/**
 * Add attributes for Responses API responses
 */
function addResponsesApiAttributes(span: Span, response: OpenAIResponseObject): void {
  setCommonResponseAttributes(span, response.id, response.model, response.created_at);

  if (response.status) {
    span.setAttributes({
      [GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]: JSON.stringify([response.status]),
    });
  }

  // Token usage for responses API
  if (response.usage) {
    setTokenUsageAttributes(
      span,
      response.usage.input_tokens,
      response.usage.output_tokens,
      response.usage.total_tokens,
    );
  }
}

/**
 * Add response attributes to spans
 * This currently supports both Chat Completion and Responses API responses
 */
function addResponseAttributes(span: Span, result: unknown, recordOutputs?: boolean): void {
  if (!result || typeof result !== 'object') return;

  const response = result as OpenAiResponse;

  if (isChatCompletionResponse(response)) {
    addChatCompletionAttributes(span, response);

    // eslint-disable-next-line no-console
    console.log(
      'response is chat completion',
      response,
      'choices',
      response.choices,
      'choices length',
      response.choices?.length,
    );

    // Record outputs if enabled - must be stringified JSON array
    if (recordOutputs && response.choices && response.choices.length > 0) {
      const responseTexts = response.choices.map(choice => choice.message?.content || '');
      span.setAttributes({
        [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: JSON.stringify(responseTexts),
      });
    }
  } else if (isResponsesApiResponse(response)) {
    addResponsesApiAttributes(span, response);

    // Record outputs if enabled - must be stringified JSON array
    if (recordOutputs && response.output_text) {
      span.setAttributes({
        [GEN_AI_RESPONSE_TEXT_ATTRIBUTE]: JSON.stringify([response.output_text]),
      });
    }
  }
}

/**
 * Get options from integration configuration
 */
function getOptionsFromIntegration(): OpenAiOptions {
  const scope = getCurrentScope();
  const client = scope.getClient();
  const integration = client?.getIntegrationByName('OpenAI') as OpenAiIntegration | undefined;
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
  methodPath: InstrumentedMethod,
  context: unknown,
  options?: OpenAiOptions,
): (...args: T) => Promise<R> {
  return async function instrumentedMethod(...args: T): Promise<R> {
    const finalOptions = options || getOptionsFromIntegration();
    const requestAttributes = extractRequestAttributes(args, methodPath);
    const model = requestAttributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE] || 'unknown';
    const operationName = getOperationName(methodPath);

    return startSpan(
      {
        // Span name follows Sentry convention: "{operation_name} {model}"
        // e.g., "chat gpt-4", "chat o3-mini", "embeddings text-embedding-3-small"
        name: `${operationName} ${model}`,
        op: getSpanOperation(methodPath),
        attributes: requestAttributes as Record<string, SpanAttributeValue>,
      },
      async (span: Span) => {
        try {
          // Record inputs if enabled - must be stringified JSON
          if (finalOptions.recordInputs && args[0] && typeof args[0] === 'object') {
            const params = args[0] as Record<string, unknown>;
            if (params.messages) {
              span.setAttributes({
                [GEN_AI_REQUEST_MESSAGES_ATTRIBUTE]: JSON.stringify(params.messages),
              });
            }
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
 * Create a deep proxy for OpenAI client instrumentation
 */
function createDeepProxy(target: object, currentPath = '', options?: OpenAiOptions): OpenAiClient {
  return new Proxy(target, {
    get(obj: Record<string | symbol, unknown>, prop: string | symbol): unknown {
      if (typeof prop === 'symbol') {
        return obj[prop];
      }

      const value = obj[prop];
      const methodPath = buildMethodPath(currentPath, prop);

      if (typeof value === 'function' && shouldInstrument(methodPath)) {
        return instrumentMethod(value as (...args: unknown[]) => Promise<unknown>, methodPath, obj, options);
      }

      if (typeof value === 'object' && value !== null) {
        return createDeepProxy(value, methodPath, options);
      }

      return value;
    },
  });
}

/**
 * Instrument an OpenAI client with Sentry tracing
 * Can be used across Node.js, Cloudflare Workers, and Vercel Edge
 */
export function instrumentOpenAiClient(client: OpenAiClient, options?: OpenAiOptions): OpenAiClient {
  return createDeepProxy(client, '', options);
}
