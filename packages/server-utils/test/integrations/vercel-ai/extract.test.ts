import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_RESPONSE_MODEL,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
} from '@sentry/conventions/attributes';
import { GEN_AI_EXTRACT } from '@sentry/conventions/op';
import { getMainCarrier, setCurrentClient, spanToStaticSpanJSON } from '@sentry/core';
import type { Span } from '@sentry/core';
import { createSpanFromMessage, enrichSpanOnEnd } from '../../../src/integrations/vercel-ai/vercel-ai-dc-subscriber';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

type Message = Parameters<typeof createSpanFromMessage>[0];

const fields = { invoiceNumber: { type: 'text', instructions: 'The invoice number' } };
const answers = { invoiceNumber: { type: 'text', value: 'INV-2291', confidence: 0.98 } };

describe('Vercel AI extract spans', () => {
  let endedSpans: Span[];

  beforeEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
    const client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
        tracesSampleRate: 1,
      }),
    );
    setCurrentClient(client);
    client.init();
    endedSpans = [];
    client.on('spanEnd', span => endedSpans.push(span));
  });

  afterEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
  });

  function runExtract(event: Message['event'], result: Message['result']): ReturnType<typeof spanToStaticSpanJSON> {
    const message = { type: 'experimental_extract', event, result } satisfies Message;
    const span = createSpanFromMessage(message, {} as Parameters<typeof createSpanFromMessage>[1])!;
    enrichSpanOnEnd(span, message);
    span.end();
    return spanToStaticSpanJSON(endedSpans[0]!);
  }

  it('creates an extract span with inputs, outputs and usage', () => {
    const json = runExtract(
      {
        provider: 'gateway',
        modelId: 'cloudflare/clairic',
        state: 'Invoice INV-2291 from Northwind Supply',
        fields,
        referenceDate: '2026-01-15',
        recordInputs: true,
        recordOutputs: true,
      },
      {
        answers,
        usage: { inputTokens: 50, outputTokens: 4, totalTokens: 54 },
        response: { modelId: 'clairic' },
      },
    );

    expect(json.description).toBe('extract cloudflare/clairic');
    expect(json.op).toBe(GEN_AI_EXTRACT);
    expect(json.data).toMatchObject({
      [GEN_AI_OPERATION_NAME]: 'extract',
      [GEN_AI_RESPONSE_MODEL]: 'clairic',
      [GEN_AI_USAGE_INPUT_TOKENS]: 50,
      [GEN_AI_USAGE_OUTPUT_TOKENS]: 4,
      [GEN_AI_USAGE_TOTAL_TOKENS]: 54,
    });
    expect(JSON.parse(json.data?.[GEN_AI_INPUT_MESSAGES] as string)).toEqual([
      { state: 'Invoice INV-2291 from Northwind Supply', fields, referenceDate: '2026-01-15' },
    ]);
    expect(JSON.parse(json.data?.[GEN_AI_OUTPUT_MESSAGES] as string)).toEqual([{ answers }]);
  });

  it('does not record inputs or outputs when recording is off', () => {
    const json = runExtract(
      {
        provider: 'gateway',
        modelId: 'cloudflare/clairic',
        state: 'Invoice INV-2291 from Northwind Supply',
        fields,
        recordInputs: false,
        recordOutputs: false,
      },
      { answers },
    );

    expect(json.op).toBe(GEN_AI_EXTRACT);
    expect(json.data?.[GEN_AI_INPUT_MESSAGES]).toBeUndefined();
    expect(json.data?.[GEN_AI_OUTPUT_MESSAGES]).toBeUndefined();
  });

  // `ai` >= 7.0.163 replaces the inputs with empty values when `recordInputs` is false.
  it('does not record stripped inputs', () => {
    const json = runExtract(
      { provider: 'gateway', modelId: 'cloudflare/clairic', state: '', fields: {}, recordInputs: true },
      undefined,
    );

    expect(json.data?.[GEN_AI_INPUT_MESSAGES]).toBeUndefined();
  });
});
