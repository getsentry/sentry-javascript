import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as AiCoreUtils from '../../../../src/ai/core/utils';
import type * as SentryCore from '@sentry/core';
import {
  GEN_AI_EMBEDDINGS_INPUT,
  GEN_AI_OPERATION_NAME,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MODEL,
} from '@sentry/conventions/attributes';
import {
  GEN_AI_EMBEDDINGS_OPERATION_ATTRIBUTE,
  GEN_AI_REQUEST_DIMENSIONS_ATTRIBUTE,
  GEN_AI_REQUEST_ENCODING_FORMAT_ATTRIBUTE,
} from '../../../../src/ai/core/gen-ai-attributes';
import { instrumentEmbeddingMethod, instrumentLangChainEmbeddings } from '../../../../src/ai/langchain/embeddings';

vi.mock('../../../../src/ai/core/utils', async importOriginal => {
  const actual = (await importOriginal()) as typeof AiCoreUtils;
  return {
    ...actual,
    resolveAIRecordingOptions: (options: { recordInputs?: boolean; recordOutputs?: boolean } = {}) => ({
      recordInputs: options.recordInputs ?? false,
      recordOutputs: options.recordOutputs ?? false,
    }),
  };
});

let capturedSpanConfig: { name: string; op: string; attributes: Record<string, unknown> } | undefined;

vi.mock('@sentry/core', async importOriginal => {
  const actual = (await importOriginal()) as typeof SentryCore;
  return {
    ...actual,
    startSpan: (
      config: { name: string; op: string; attributes: Record<string, unknown> },
      callback: (span: unknown) => unknown,
    ) => {
      capturedSpanConfig = config;
      return callback({ setAttribute: vi.fn() });
    },
    captureException: vi.fn(),
  };
});

import { captureException, getMainCarrier, setCurrentClient } from '@sentry/core';
import { getDefaultTestClientOptions, TestClient } from '../../../mocks/client';

function setupClient(traceLifecycle: 'static' | 'stream'): void {
  const client = new TestClient(
    getDefaultTestClientOptions({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
      tracesSampleRate: 1,
      traceLifecycle,
    }),
  );
  setCurrentClient(client);
  client.init();
}

describe('instrumentEmbeddingMethod', () => {
  beforeEach(() => {
    capturedSpanConfig = undefined;
    getMainCarrier().__SENTRY__ = undefined;
  });

  afterEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
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
    expect(capturedSpanConfig!.attributes[GEN_AI_OPERATION_NAME]).toBe('embeddings');
    expect(capturedSpanConfig!.attributes[GEN_AI_REQUEST_MODEL]).toBe('text-embedding-3-small');
    expect(capturedSpanConfig!.attributes[GEN_AI_PROVIDER_NAME]).toBe('openai');
    expect(capturedSpanConfig!.attributes[GEN_AI_REQUEST_DIMENSIONS_ATTRIBUTE]).toBe(1536);
    expect(capturedSpanConfig!.attributes[GEN_AI_REQUEST_ENCODING_FORMAT_ATTRIBUTE]).toBe('float');
    expect(original).toHaveBeenCalledWith('Hello world');
  });

  it('records input when recordInputs is true', async () => {
    const original = vi.fn().mockResolvedValue([0.1]);
    const instance = { constructor: { name: 'OpenAIEmbeddings' }, model: 'text-embedding-3-small' };

    const wrapped = instrumentEmbeddingMethod(original, { recordInputs: true });
    await wrapped.call(instance, 'Hello world');
    expect(capturedSpanConfig!.attributes[GEN_AI_EMBEDDINGS_INPUT]).toBe('Hello world');

    await wrapped.call(instance, ['doc1', 'doc2']);
    expect(capturedSpanConfig!.attributes[GEN_AI_EMBEDDINGS_INPUT]).toBe('["doc1","doc2"]');
  });

  it('rethrows the error to the caller without capturing it', async () => {
    const error = new Error('API error');
    const original = vi.fn().mockRejectedValue(error);
    const wrapped = instrumentEmbeddingMethod(original);

    const instance = { constructor: { name: 'OpenAIEmbeddings' }, model: 'error-model' };
    await expect(wrapped.call(instance, 'test')).rejects.toThrow('API error');

    expect(captureException).not.toHaveBeenCalled();
  });

  it('infers system from class name', async () => {
    const original = vi.fn().mockResolvedValue([0.1]);
    const wrapped = instrumentEmbeddingMethod(original);

    await wrapped.call({ constructor: { name: 'GoogleGenerativeAIEmbeddings' }, model: 'test' }, 'test');
    expect(capturedSpanConfig!.attributes[GEN_AI_PROVIDER_NAME]).toBe('google_genai');
  });

  it('keeps `embeddings unknown` when the model is missing in static mode', async () => {
    setupClient('static');
    const original = vi.fn().mockResolvedValue([0.1]);
    const wrapped = instrumentEmbeddingMethod(original);

    await wrapped.call({}, 'test');

    expect(capturedSpanConfig!.name).toBe('embeddings unknown');
    expect(capturedSpanConfig!.attributes[GEN_AI_REQUEST_MODEL]).toBe('unknown');
    expect(capturedSpanConfig!.attributes[GEN_AI_PROVIDER_NAME]).toBe('langchain');
    expect(capturedSpanConfig!.attributes[GEN_AI_REQUEST_DIMENSIONS_ATTRIBUTE]).toBeUndefined();
  });

  it('uses the operation name when the model is missing and span streaming is enabled', async () => {
    setupClient('stream');
    const original = vi.fn().mockResolvedValue([0.1]);
    const wrapped = instrumentEmbeddingMethod(original);

    await wrapped.call({}, 'test');

    expect(capturedSpanConfig!.name).toBe('embeddings');
  });

  it('uses the operation name when the model is not a string and span streaming is enabled', async () => {
    setupClient('stream');
    const original = vi.fn().mockResolvedValue([0.1]);
    const wrapped = instrumentEmbeddingMethod(original);

    await wrapped.call({ model: { id: 'text-embedding-3-small' } }, 'test');

    expect(capturedSpanConfig!.name).toBe('embeddings');
  });
});

describe('instrumentLangChainEmbeddings', () => {
  beforeEach(() => {
    capturedSpanConfig = undefined;
    getMainCarrier().__SENTRY__ = undefined;
  });

  afterEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
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
    expect(capturedSpanConfig!.attributes[GEN_AI_OPERATION_NAME]).toBe('embeddings');

    await wrapped.embedDocuments(['doc1']);
    expect(capturedSpanConfig!.attributes[GEN_AI_OPERATION_NAME]).toBe('embeddings');
  });
});
