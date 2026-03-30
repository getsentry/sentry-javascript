import { captureException } from '../../exports';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../../semanticAttributes';
import { SPAN_STATUS_ERROR } from '../../tracing';
import { startSpan } from '../../tracing/trace';
import type { SpanAttributeValue } from '../../types-hoist/span';
import {
  GEN_AI_EMBED_DO_EMBED_OPERATION_ATTRIBUTE,
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

type EmbeddingOperationName = 'embed' | 'embed_many';

/**
 * Infers the AI provider system name from the embedding class constructor name.
 */
function inferSystemFromClassName(name: string): string | undefined {
  if (name.includes('OpenAI')) return 'openai';
  if (name.includes('Google')) return 'google_genai';
  if (name.includes('Mistral')) return 'mistralai';
  if (name.includes('Vertex')) return 'google_vertexai';
  if (name.includes('Bedrock')) return 'aws_bedrock';
  if (name.includes('Ollama')) return 'ollama';
  if (name.includes('Cloudflare')) return 'cloudflare';
  if (name.includes('Cohere')) return 'cohere';
  return undefined;
}

/**
 * Extracts span attributes from a LangChain embedding class instance.
 */
function extractEmbeddingAttributes(
  instance: unknown,
  operationName: EmbeddingOperationName,
): Record<string, SpanAttributeValue> {
  const inst = (instance ?? {}) as Record<string, unknown>;

  const attributes: Record<string, SpanAttributeValue> = {
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: LANGCHAIN_ORIGIN,
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: GEN_AI_EMBED_DO_EMBED_OPERATION_ATTRIBUTE,
    [GEN_AI_OPERATION_NAME_ATTRIBUTE]: operationName,
  };

  const modelName = inst.model ?? inst.modelName ?? 'unknown';
  attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE] = String(modelName);

  const ctorName = (instance as { constructor?: { name?: string } }).constructor?.name ?? '';
  const system = inferSystemFromClassName(ctorName);
  if (system) {
    attributes[GEN_AI_SYSTEM_ATTRIBUTE] = system;
  }

  if (inst.dimensions != null) {
    const n = Number(inst.dimensions);
    if (!Number.isNaN(n)) {
      attributes[GEN_AI_REQUEST_DIMENSIONS_ATTRIBUTE] = n;
    }
  }

  const encodingFormat = inst.encodingFormat ?? inst.encoding_format;
  if (encodingFormat != null) {
    attributes[GEN_AI_REQUEST_ENCODING_FORMAT_ATTRIBUTE] = String(encodingFormat);
  }

  return attributes;
}

/**
 * Wraps a LangChain embedding method (embedQuery or embedDocuments) to create Sentry spans.
 *
 * Used internally by the Node.js auto-instrumentation to patch embedding class prototypes.
 */
export function wrapEmbeddingMethod(
  originalMethod: (...args: unknown[]) => Promise<unknown>,
  operationName: EmbeddingOperationName,
  options: LangChainOptions = {},
): (...args: unknown[]) => Promise<unknown> {
  const { recordInputs } = resolveAIRecordingOptions(options);

  return new Proxy(originalMethod, {
    apply(target, thisArg, args: unknown[]): Promise<unknown> {
      const attributes = extractEmbeddingAttributes(thisArg, operationName);
      const modelName = attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE] || 'unknown';

      if (recordInputs) {
        const input = args[0];
        if (input != null) {
          attributes[GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE] = typeof input === 'string' ? input : JSON.stringify(input);
        }
      }

      return startSpan(
        {
          name: `${operationName} ${modelName}`,
          op: GEN_AI_EMBED_DO_EMBED_OPERATION_ATTRIBUTE,
          attributes,
        },
        async span => {
          try {
            return await Reflect.apply(target, thisArg, args);
          } catch (error) {
            span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });

            captureException(error, {
              mechanism: {
                handled: false,
                type: `${LANGCHAIN_ORIGIN}.embeddings_error`,
              },
            });

            throw error;
          }
        },
      );
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
 * const embeddings = Sentry.wrapLangChainEmbeddings(
 *   new OpenAIEmbeddings({ model: 'text-embedding-3-small' })
 * );
 *
 * await embeddings.embedQuery('Hello world');
 * await embeddings.embedDocuments(['doc1', 'doc2']);
 * ```
 */
export function wrapLangChainEmbeddings<T extends object>(instance: T, options?: LangChainOptions): T {
  const inst = instance as Record<string, unknown>;

  if (typeof inst.embedQuery === 'function') {
    inst.embedQuery = wrapEmbeddingMethod(
      inst.embedQuery as (...args: unknown[]) => Promise<unknown>,
      'embed',
      options,
    );
  }

  if (typeof inst.embedDocuments === 'function') {
    inst.embedDocuments = wrapEmbeddingMethod(
      inst.embedDocuments as (...args: unknown[]) => Promise<unknown>,
      'embed_many',
      options,
    );
  }

  return instance;
}
