import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../../semanticAttributes';
import { startSpan } from '../../tracing/trace';
import type { SpanAttributeValue } from '../../types/span';
import {
  GEN_AI_EMBEDDINGS_OPERATION_ATTRIBUTE,
  GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE,
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_REQUEST_DIMENSIONS_ATTRIBUTE,
  GEN_AI_REQUEST_ENCODING_FORMAT_ATTRIBUTE,
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
  GEN_AI_SYSTEM_ATTRIBUTE,
} from '../ai/gen-ai-attributes';
import { resolveAIRecordingOptions } from '../ai/utils';
import { LANGCHAIN_ORIGIN } from './constants';
import type { LangChainOptions } from './types';

/**
 * Infers the AI provider system name from the embedding class instance.
 */
function inferSystemFromInstance(instance: Record<string, unknown>): string {
  const name = (instance.constructor as { name?: string })?.name ?? '';
  if (name.includes('OpenAI')) return 'openai';
  if (name.includes('Google')) return 'google_genai';
  if (name.includes('Mistral')) return 'mistralai';
  if (name.includes('Vertex')) return 'google_vertexai';
  if (name.includes('Bedrock')) return 'aws_bedrock';
  if (name.includes('Ollama')) return 'ollama';
  if (name.includes('Cloudflare')) return 'cloudflare';
  if (name.includes('Cohere')) return 'cohere';
  return 'langchain';
}

/**
 * Extracts span attributes from a LangChain embedding class instance.
 */
function extractEmbeddingAttributes(instance: unknown): Record<string, unknown> {
  const embeddingsInstance = (instance ?? {}) as Record<string, unknown>;

  const attributes: Record<string, unknown> = {
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: LANGCHAIN_ORIGIN,
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: GEN_AI_EMBEDDINGS_OPERATION_ATTRIBUTE,
    [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'embeddings',
    [GEN_AI_REQUEST_MODEL_ATTRIBUTE]: embeddingsInstance.model ?? 'unknown',
  };

  attributes[GEN_AI_SYSTEM_ATTRIBUTE] = inferSystemFromInstance(embeddingsInstance);
  if ('dimensions' in embeddingsInstance) {
    attributes[GEN_AI_REQUEST_DIMENSIONS_ATTRIBUTE] = embeddingsInstance.dimensions;
  }
  if ('encodingFormat' in embeddingsInstance) {
    attributes[GEN_AI_REQUEST_ENCODING_FORMAT_ATTRIBUTE] = embeddingsInstance.encodingFormat;
  }

  return attributes;
}

/**
 * Builds the span options for a LangChain embedding call from the embeddings instance and input.
 *
 * @internal Exported so the diagnostics-channel (orchestrion) instrumentation can build the same
 * span as the prototype-patching path below.
 */
export function _INTERNAL_getLangChainEmbeddingsSpanOptions(
  instance: unknown,
  input: unknown,
  options: LangChainOptions = {},
): { name: string; op: string; attributes: Record<string, SpanAttributeValue> } {
  const { recordInputs } = resolveAIRecordingOptions(options);
  const attributes = extractEmbeddingAttributes(instance);
  const modelName = attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE] || 'unknown';

  if (recordInputs && input != null) {
    attributes[GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE] = typeof input === 'string' ? input : JSON.stringify(input);
  }

  return {
    name: `embeddings ${modelName}`,
    op: GEN_AI_EMBEDDINGS_OPERATION_ATTRIBUTE,
    attributes: attributes as Record<string, SpanAttributeValue>,
  };
}

/**
 * Wraps a LangChain embedding method (embedQuery or embedDocuments) to create Sentry spans.
 *
 * Used internally by the Node.js auto-instrumentation to patch embedding class prototypes.
 */
export function instrumentEmbeddingMethod(
  originalMethod: (...args: unknown[]) => Promise<unknown>,
  options: LangChainOptions = {},
): (...args: unknown[]) => Promise<unknown> {
  return new Proxy(originalMethod, {
    apply(target, thisArg, args: unknown[]): Promise<unknown> {
      return startSpan(_INTERNAL_getLangChainEmbeddingsSpanOptions(thisArg, args[0], options), () => {
        // On rejection `startSpan` marks the span failed and rethrows to the caller, so we don't
        // record the error ourselves.
        return Reflect.apply(target, thisArg, args);
      });
    },
  }) as (...args: unknown[]) => Promise<unknown>;
}

/**
 * Wraps a LangChain embeddings instance to create Sentry spans for `embedQuery` and `embedDocuments` calls.
 *
 * Use this in non-Node runtimes (Cloudflare, browser, etc.) where auto-instrumentation is not available.
 *
 * @example
 * ```javascript
 * import * as Sentry from '@sentry/cloudflare';
 * import { OpenAIEmbeddings } from '@langchain/openai';
 *
 * const embeddings = Sentry.instrumentLangChainEmbeddings(
 *   new OpenAIEmbeddings({ model: 'text-embedding-3-small' })
 * );
 *
 * await embeddings.embedQuery('Hello world');
 * await embeddings.embedDocuments(['doc1', 'doc2']);
 * ```
 */
export function instrumentLangChainEmbeddings<T extends object>(instance: T, options?: LangChainOptions): T {
  const embeddingsInstance = instance as Record<string, unknown>;

  if (typeof embeddingsInstance.embedQuery === 'function') {
    embeddingsInstance.embedQuery = instrumentEmbeddingMethod(
      embeddingsInstance.embedQuery as (...args: unknown[]) => Promise<unknown>,
      options,
    );
  }

  if (typeof embeddingsInstance.embedDocuments === 'function') {
    embeddingsInstance.embedDocuments = instrumentEmbeddingMethod(
      embeddingsInstance.embedDocuments as (...args: unknown[]) => Promise<unknown>,
      options,
    );
  }

  return instance;
}
