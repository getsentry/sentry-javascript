/**
 * Shared OpenAI client instrumentation logic for all platforms.
 */

import { getCurrentScope } from '../currentScopes';
import { captureException } from '../exports';
import { startSpan } from '../tracing';

// Easy to extend method list
const INSTRUMENTED_METHODS = [
  'responses.create',
  'chat.completions.create',
  // Future additions:
  // 'embeddings.create',
  // 'images.generate',
  // 'audio.transcriptions.create',
  // 'moderations.create',
] as const;

type InstrumentedMethod = (typeof INSTRUMENTED_METHODS)[number];

export interface OpenAiOptions {
  recordInputs?: boolean;
  recordOutputs?: boolean;
}

export interface OpenAiClient {
  responses?: {
    create: (...args: any[]) => Promise<any>;
  };
  chat?: {
    completions?: {
      create: (...args: any[]) => Promise<any>;
    };
  };
}

/**
 * Check if a method path should be instrumented
 */
function shouldInstrument(methodPath: string): methodPath is InstrumentedMethod {
  return (INSTRUMENTED_METHODS as readonly string[]).includes(methodPath);
}

/**
 * Build method path from current traversal
 */
function buildMethodPath(currentPath: string, prop: string): string {
  return currentPath ? `${currentPath}.${prop}` : prop;
}

/**
 * Check if a response is a streaming response
 */
function isStreamingResponse(result: any): boolean {
  return result && typeof result[Symbol.asyncIterator] === 'function';
}

/**
 * Extract request attributes from method arguments
 */
function extractRequestAttributes(args: any[], methodPath: string): Record<string, any> {
  const attributes: Record<string, any> = {
    'openai.request.method': methodPath,
  };

  if (args.length > 0) {
    const params = args[0];
    if (params && typeof params === 'object') {
      if (params.model) {
        attributes['openai.request.model'] = params.model;
      }
      if (typeof params.stream === 'boolean') {
        attributes['openai.request.stream'] = params.stream;
      }
    }
  }

  return attributes;
}

/**
 * Add response attributes to span
 */
function addResponseAttributes(span: any, result: any, methodPath: string): void {
  if (!result || typeof result !== 'object') return;

  // Common response attributes
  if (result.id) {
    span.setAttributes({ 'openai.response.id': result.id });
  }
  if (result._request_id) {
    span.setAttributes({ 'openai.response.request_id': result._request_id });
  }
  if (result.usage) {
    if (result.usage.prompt_tokens) {
      span.setAttributes({ 'openai.usage.prompt_tokens': result.usage.prompt_tokens });
    }
    if (result.usage.completion_tokens) {
      span.setAttributes({ 'openai.usage.completion_tokens': result.usage.completion_tokens });
    }
    if (result.usage.total_tokens) {
      span.setAttributes({ 'openai.usage.total_tokens': result.usage.total_tokens });
    }
  }

  // Method-specific attributes
  if (methodPath === 'chat.completions.create') {
    if (result.choices && Array.isArray(result.choices)) {
      span.setAttributes({ 'openai.chat.response.choices.count': result.choices.length });
      if (result.choices[0]?.finish_reason) {
        span.setAttributes({ 'openai.chat.response.finish_reason': result.choices[0].finish_reason });
      }
    }
  }
}

/**
 * Instrument a streaming response
 */
function instrumentStream(stream: any, span: any): any {
  const startTime = Date.now();
  let firstTokenTime: number | null = null;
  let tokenCount = 0;

  return {
    [Symbol.asyncIterator]: async function* () {
      try {
        for await (const chunk of stream) {
          if (firstTokenTime === null) {
            firstTokenTime = Date.now();
            span.setAttributes({
              'openai.stream.time_to_first_token_ms': firstTokenTime - startTime,
            });
          }
          tokenCount++;
          yield chunk;
        }
      } finally {
        const totalTime = Date.now() - startTime;
        span.setAttributes({
          'openai.stream.total_time_ms': totalTime,
        });
        if (firstTokenTime && totalTime > 0) {
          span.setAttributes({
            'openai.stream.tokens_per_second': (tokenCount * 1000) / totalTime,
          });
        }
      }
    },
  };
}

/**
 * OpenAI Integration interface for type safety
 */
interface OpenAiIntegration {
  name: string;
  options?: OpenAiOptions;
}

/**
 * Get options from integration configuration
 */
function getOptionsFromIntegration(): OpenAiOptions {
  const client = getCurrentScope().getClient();
  const integration = client?.getIntegrationByName('OpenAI') as OpenAiIntegration | undefined;
  const shouldRecordInputsAndOutputs = integration ? Boolean(client?.getOptions().sendDefaultPii) : false;

  return {
    recordInputs: integration?.options?.recordInputs ?? shouldRecordInputsAndOutputs,
    recordOutputs: integration?.options?.recordOutputs ?? shouldRecordInputsAndOutputs,
  };
}

/**
 * Instrument a method with Sentry spans
 */
function instrumentMethod(
  originalMethod: Function,
  methodPath: InstrumentedMethod,
  context: any,
  options?: OpenAiOptions,
): Function {
  return async function instrumentedMethod(...args: any[]) {
    const finalOptions = options || getOptionsFromIntegration();
    const requestAttributes = extractRequestAttributes(args, methodPath);
    const model = requestAttributes['openai.request.model'] || 'unknown';

    return startSpan(
      {
        name: `${methodPath} ${model}`,
        op: `ai.openai.${methodPath}`,
        attributes: requestAttributes,
      },
      async span => {
        try {
          const result = await originalMethod.apply(context, args);

          if (isStreamingResponse(result)) {
            return instrumentStream(result, span);
          } else {
            addResponseAttributes(span, result, methodPath);
            return result;
          }
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
function createDeepProxy(target: any, currentPath = '', options?: OpenAiOptions): any {
  return new Proxy(target, {
    get(obj, prop: string | symbol) {
      if (typeof prop === 'symbol') {
        return obj[prop];
      }

      const value = obj[prop];
      const methodPath = buildMethodPath(currentPath, prop);

      if (typeof value === 'function' && shouldInstrument(methodPath)) {
        return instrumentMethod(value, methodPath as InstrumentedMethod, obj, options);
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
