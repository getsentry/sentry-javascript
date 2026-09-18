import { setCurrentClient, spanToJSON } from '@sentry/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { createSpanFromMessage } from '../../../src/integrations/vercel-ai/vercel-ai-dc-subscriber';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

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

function spanNameFor(type: string, event: Record<string, unknown>): string | undefined {
  const span = createSpanFromMessage(
    { type, event } as Parameters<typeof createSpanFromMessage>[0],
    {} as Parameters<typeof createSpanFromMessage>[1],
  );
  span?.end();

  return span && spanToJSON(span).name;
}

// The channel path never emitted an `unknown` model sentinel, so these names already follow the
// inference templates in both lifecycles.
describe.each(['static', 'stream'] as const)('vercel ai inference span names (%s)', traceLifecycle => {
  beforeEach(() => {
    setupClient(traceLifecycle);
  });

  it.each([
    ['languageModelCall', 'generate_content'],
    ['embed', 'embeddings'],
    ['embedMany', 'embeddings'],
    ['rerank', 'rerank'],
  ])('names a %s span `%s {model}` when a model is present', (type, operation) => {
    expect(spanNameFor(type, { modelId: 'gpt-4' })).toBe(`${operation} gpt-4`);
  });

  it.each([
    ['languageModelCall', 'generate_content'],
    ['embed', 'embeddings'],
    ['embedMany', 'embeddings'],
    ['rerank', 'rerank'],
  ])('names a %s span `%s` when the model is missing', (type, operation) => {
    expect(spanNameFor(type, {})).toBe(operation);
  });
});
