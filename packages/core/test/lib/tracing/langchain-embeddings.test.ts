import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE,
  GEN_AI_EMBEDDINGS_OPERATION_ATTRIBUTE,
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_REQUEST_DIMENSIONS_ATTRIBUTE,
  GEN_AI_REQUEST_ENCODING_FORMAT_ATTRIBUTE,
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
  GEN_AI_SYSTEM_ATTRIBUTE,
} from '../../../src/tracing/ai/gen-ai-attributes';
import { instrumentEmbeddingMethod, instrumentLangChainEmbeddings } from '../../../src/tracing/langchain/embeddings';

vi.mock('../../../src/tracing/ai/utils', () => ({
  resolveAIRecordingOptions: (options: { recordInputs?: boolean; recordOutputs?: boolean } = {}) => ({
    recordInputs: options.recordInputs ?? false,
    recordOutputs: options.recordOutputs ?? false,
  }),
}));

let capturedSpanConfig: { name: string; op: string; attributes: Record<string, unknown> } | undefined;

vi.mock('../../../src/tracing/trace', () => ({
  startSpan: (
    config: { name: string; op: string; attributes: Record<string, unknown> },
    callback: (span: unknown) => unknown,
  ) => {
    capturedSpanConfig = config;
    return callback({ setAttribute: vi.fn() });
  },
}));

import { captureException } from '../../../src/exports';

vi.mock('../../../src/exports', () => ({
  captureException: vi.fn(),
}));

describe('instrumentEmbeddingMethod', () => {
  beforeEach(() => {
    capturedSpanConfig = undefined;
  });

  it('creates a span with correct attributes', async () => {
    const original = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);
    const wrapped = instrumentEmbeddingMethod(original);

    const instance = {
      constructor: { name: 'OpenAIEmbeddings' },
      model: 'text-embedding-3-small',
      dimensions: 1536,
      encodingFormat: 'float',
    };
    await wrapped.call(instance, 'Hello world');

    expect(capturedSpanConfig).toBeDefined();
    expect(capturedSpanConfig!.name).toBe('embeddings text-embedding-3-small');
    expect(capturedSpanConfig!.op).toBe(GEN_AI_EMBEDDINGS_OPERATION_ATTRIBUTE);
    expect(capturedSpanConfig!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toBe('embeddings');
    expect(capturedSpanConfig!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toBe('text-embedding-3-small');
    expect(capturedSpanConfig!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toBe('openai');
    expect(capturedSpanConfig!.attributes[GEN_AI_REQUEST_DIMENSIONS_ATTRIBUTE]).toBe(1536);
    expect(capturedSpanConfig!.attributes[GEN_AI_REQUEST_ENCODING_FORMAT_ATTRIBUTE]).toBe('float');
    expect(original).toHaveBeenCalledWith('Hello world');
  });

  it('records input when recordInputs is true', async () => {
    const original = vi.fn().mockResolvedValue([0.1]);
    const instance = { constructor: { name: 'OpenAIEmbeddings' }, model: 'text-embedding-3-small' };

    const wrapped = instrumentEmbeddingMethod(original, { recordInputs: true });
    await wrapped.call(instance, 'Hello world');
    expect(capturedSpanConfig!.attributes[GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE]).toBe('Hello world');

    await wrapped.call(instance, ['doc1', 'doc2']);
    expect(capturedSpanConfig!.attributes[GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE]).toBe('["doc1","doc2"]');
  });

  it('captures exception on failure', async () => {
    const error = new Error('API error');
    const original = vi.fn().mockRejectedValue(error);
    const wrapped = instrumentEmbeddingMethod(original);

    const instance = { constructor: { name: 'OpenAIEmbeddings' }, model: 'error-model' };
    await expect(wrapped.call(instance, 'test')).rejects.toThrow('API error');

    expect(captureException).toHaveBeenCalledWith(error, {
      mechanism: { handled: false, type: 'auto.ai.langchain' },
    });
  });

  it('infers system from class name', async () => {
    const original = vi.fn().mockResolvedValue([0.1]);
    const wrapped = instrumentEmbeddingMethod(original);

    await wrapped.call({ constructor: { name: 'GoogleGenerativeAIEmbeddings' }, model: 'test' }, 'test');
    expect(capturedSpanConfig!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toBe('google_genai');
  });

  it('handles missing instance properties gracefully', async () => {
    const original = vi.fn().mockResolvedValue([0.1]);
    const wrapped = instrumentEmbeddingMethod(original);

    await wrapped.call({}, 'test');

    expect(capturedSpanConfig!.name).toBe('embeddings unknown');
    expect(capturedSpanConfig!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toBe('unknown');
    expect(capturedSpanConfig!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toBe('langchain');
    expect(capturedSpanConfig!.attributes[GEN_AI_REQUEST_DIMENSIONS_ATTRIBUTE]).toBeUndefined();
  });
});

describe('instrumentLangChainEmbeddings', () => {
  beforeEach(() => {
    capturedSpanConfig = undefined;
  });

  it('wraps both embedQuery and embedDocuments on an instance', async () => {
    const instance = {
      constructor: { name: 'OpenAIEmbeddings' },
      model: 'text-embedding-3-small',
      embedQuery: vi.fn().mockResolvedValue([0.1]),
      embedDocuments: vi.fn().mockResolvedValue([[0.1]]),
    };

    const wrapped = instrumentLangChainEmbeddings(instance);
    expect(wrapped).toBe(instance);

    await wrapped.embedQuery('test');
    expect(capturedSpanConfig!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toBe('embeddings');

    await wrapped.embedDocuments(['doc1']);
    expect(capturedSpanConfig!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toBe('embeddings');
  });
});
