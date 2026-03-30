import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GEN_AI_EMBEDDINGS_OPERATION_ATTRIBUTE,
  GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE,
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_REQUEST_DIMENSIONS_ATTRIBUTE,
  GEN_AI_REQUEST_ENCODING_FORMAT_ATTRIBUTE,
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
  GEN_AI_SYSTEM_ATTRIBUTE,
} from '../../../src/tracing/ai/gen-ai-attributes';
import { wrapEmbeddingMethod, wrapLangChainEmbeddings } from '../../../src/tracing/langchain/embeddings';

// Mock resolveAIRecordingOptions to control recordInputs
vi.mock('../../../src/tracing/ai/utils', () => ({
  resolveAIRecordingOptions: (options: { recordInputs?: boolean; recordOutputs?: boolean } = {}) => ({
    recordInputs: options.recordInputs ?? false,
    recordOutputs: options.recordOutputs ?? false,
  }),
}));

// Capture span data from startSpan calls
let capturedSpanConfig: { name: string; op: string; attributes: Record<string, unknown> } | undefined;
let capturedSpanSetStatus: ReturnType<typeof vi.fn>;

vi.mock('../../../src/tracing/trace', () => ({
  startSpan: (
    config: { name: string; op: string; attributes: Record<string, unknown> },
    callback: (span: unknown) => unknown,
  ) => {
    capturedSpanConfig = config;
    const mockSpan = {
      setStatus: capturedSpanSetStatus,
      setAttribute: vi.fn(),
    };
    return callback(mockSpan);
  },
}));

import { captureException } from '../../../src/exports';

vi.mock('../../../src/exports', () => ({
  captureException: vi.fn(),
}));

describe('wrapEmbeddingMethod', () => {
  beforeEach(() => {
    capturedSpanConfig = undefined;
    capturedSpanSetStatus = vi.fn();
  });

  it('creates a span with correct attributes for embedQuery', async () => {
    const original = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);
    const wrapped = wrapEmbeddingMethod(original, 'embed');

    const instance = { constructor: { name: 'OpenAIEmbeddings' }, model: 'text-embedding-3-small', dimensions: 1536 };
    await wrapped.call(instance, 'Hello world');

    expect(capturedSpanConfig).toBeDefined();
    expect(capturedSpanConfig!.name).toBe('embed text-embedding-3-small');
    expect(capturedSpanConfig!.op).toBe(GEN_AI_EMBEDDINGS_OPERATION_ATTRIBUTE);
    expect(capturedSpanConfig!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toBe('embed');
    expect(capturedSpanConfig!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toBe('text-embedding-3-small');
    expect(capturedSpanConfig!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toBe('openai');
    expect(capturedSpanConfig!.attributes[GEN_AI_REQUEST_DIMENSIONS_ATTRIBUTE]).toBe(1536);
    expect(original).toHaveBeenCalledWith('Hello world');
  });

  it('creates a span with correct attributes for embedDocuments', async () => {
    const original = vi.fn().mockResolvedValue([[0.1], [0.2]]);
    const wrapped = wrapEmbeddingMethod(original, 'embed_many');

    const instance = { constructor: { name: 'MistralAIEmbeddings' }, model: 'mistral-embed', encodingFormat: 'float' };
    await wrapped.call(instance, ['doc1', 'doc2']);

    expect(capturedSpanConfig!.name).toBe('embed_many mistral-embed');
    expect(capturedSpanConfig!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toBe('embed_many');
    expect(capturedSpanConfig!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toBe('mistralai');
    expect(capturedSpanConfig!.attributes[GEN_AI_REQUEST_ENCODING_FORMAT_ATTRIBUTE]).toBe('float');
  });

  it('records input when recordInputs is true (string)', async () => {
    const original = vi.fn().mockResolvedValue([0.1]);
    const wrapped = wrapEmbeddingMethod(original, 'embed', { recordInputs: true });

    const instance = { constructor: { name: 'OpenAIEmbeddings' }, model: 'text-embedding-3-small' };
    await wrapped.call(instance, 'Hello world');

    expect(capturedSpanConfig!.attributes[GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE]).toBe('Hello world');
  });

  it('records input when recordInputs is true (array)', async () => {
    const original = vi.fn().mockResolvedValue([[0.1]]);
    const wrapped = wrapEmbeddingMethod(original, 'embed_many', { recordInputs: true });

    const instance = { constructor: { name: 'OpenAIEmbeddings' }, model: 'text-embedding-3-small' };
    await wrapped.call(instance, ['doc1', 'doc2']);

    expect(capturedSpanConfig!.attributes[GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE]).toBe('["doc1","doc2"]');
  });

  it('sets error status on failure', async () => {
    const error = new Error('API error');
    const original = vi.fn().mockRejectedValue(error);
    const wrapped = wrapEmbeddingMethod(original, 'embed');

    const instance = { constructor: { name: 'OpenAIEmbeddings' }, model: 'error-model' };
    await expect(wrapped.call(instance, 'test')).rejects.toThrow('API error');

    expect(capturedSpanSetStatus).toHaveBeenCalledWith({ code: 2, message: 'internal_error' });
    expect(captureException).toHaveBeenCalledWith(error, {
      mechanism: { handled: false, type: 'auto.ai.langchain.embeddings_error' },
    });
  });

  it('infers system from various class names', async () => {
    const original = vi.fn().mockResolvedValue([0.1]);

    const testCases = [
      { className: 'GoogleGenerativeAIEmbeddings', expected: 'google_genai' },
      { className: 'VertexAIEmbeddings', expected: 'google_vertexai' },
      { className: 'BedrockEmbeddings', expected: 'aws_bedrock' },
      { className: 'OllamaEmbeddings', expected: 'ollama' },
      { className: 'CloudflareWorkersAIEmbeddings', expected: 'cloudflare' },
    ];

    for (const { className, expected } of testCases) {
      const wrapped = wrapEmbeddingMethod(original, 'embed');
      const instance = { constructor: { name: className }, model: 'test-model' };
      await wrapped.call(instance, 'test');

      expect(capturedSpanConfig!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toBe(expected);
    }
  });

  it('handles missing instance properties gracefully', async () => {
    const original = vi.fn().mockResolvedValue([0.1]);
    const wrapped = wrapEmbeddingMethod(original, 'embed');

    await wrapped.call({}, 'test');

    expect(capturedSpanConfig!.name).toBe('embed unknown');
    expect(capturedSpanConfig!.attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE]).toBe('unknown');
    expect(capturedSpanConfig!.attributes[GEN_AI_SYSTEM_ATTRIBUTE]).toBeUndefined();
    expect(capturedSpanConfig!.attributes[GEN_AI_REQUEST_DIMENSIONS_ATTRIBUTE]).toBeUndefined();
  });
});

describe('wrapLangChainEmbeddings', () => {
  beforeEach(() => {
    capturedSpanConfig = undefined;
    capturedSpanSetStatus = vi.fn();
  });

  it('wraps both embedQuery and embedDocuments on an instance', async () => {
    const mockEmbedQuery = vi.fn().mockResolvedValue([0.1]);
    const mockEmbedDocuments = vi.fn().mockResolvedValue([[0.1]]);

    const instance = {
      constructor: { name: 'OpenAIEmbeddings' },
      model: 'text-embedding-3-small',
      embedQuery: mockEmbedQuery,
      embedDocuments: mockEmbedDocuments,
    };

    const wrapped = wrapLangChainEmbeddings(instance);
    expect(wrapped).toBe(instance); // Returns the same instance

    // embedQuery should be wrapped
    await wrapped.embedQuery('test');
    expect(capturedSpanConfig!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toBe('embed');

    // embedDocuments should be wrapped
    await wrapped.embedDocuments(['doc1']);
    expect(capturedSpanConfig!.attributes[GEN_AI_OPERATION_NAME_ATTRIBUTE]).toBe('embed_many');
  });

});
