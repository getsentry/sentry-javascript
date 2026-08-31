import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GEN_AI_OPERATION_NAME, GEN_AI_PIPELINE_NAME } from '@sentry/conventions/attributes';
import { getMainCarrier, setCurrentClient, spanToStaticSpanJSON } from '@sentry/core';
import type { Span } from '@sentry/core';
import { createLangChainCallbackHandler } from '../../../../src/ai/langchain';
import { getDefaultTestClientOptions, TestClient } from '../../../mocks/client';

describe('LangChain invoke_agent span names', () => {
  beforeEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
  });

  afterEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
  });

  function setupClient(traceLifecycle: 'static' | 'stream'): Span[] {
    const client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
        tracesSampleRate: 1,
        traceLifecycle,
      }),
    );
    setCurrentClient(client);
    client.init();

    const endedSpans: Span[] = [];
    client.on('spanEnd', span => endedSpans.push(span));
    return endedSpans;
  }

  function runChain(runName?: string, chain: { name?: string } = {}): void {
    const handler = createLangChainCallbackHandler();
    handler.handleChainStart?.(
      chain,
      { topic: 'weather' },
      'run-1',
      undefined,
      undefined,
      undefined,
      undefined,
      runName,
    );
    handler.handleChainEnd?.({ ok: true }, 'run-1');
  }

  it('keeps `chain {chainName}` in static mode', () => {
    const endedSpans = setupClient('static');
    runChain('format_prompt');

    const span = spanToStaticSpanJSON(endedSpans[0]!);
    expect(span.description).toBe('chain format_prompt');
    expect(span.data?.[GEN_AI_OPERATION_NAME]).toBe('invoke_agent');
    expect(span.data?.[GEN_AI_PIPELINE_NAME]).toBe('format_prompt');
    expect(span.data?.['langchain.chain.name']).toBeUndefined();
  });

  it('sets gen_ai.pipeline.name from chain.name when runName is missing', () => {
    const endedSpans = setupClient('static');
    runChain(undefined, { name: 'RunnableSequence' });

    const span = spanToStaticSpanJSON(endedSpans[0]!);
    expect(span.description).toBe('chain RunnableSequence');
    expect(span.data?.[GEN_AI_PIPELINE_NAME]).toBe('RunnableSequence');
  });

  it('keeps `chain unknown_chain` when the chain name is missing in static mode', () => {
    const endedSpans = setupClient('static');
    runChain();

    const span = spanToStaticSpanJSON(endedSpans[0]!);
    expect(span.description).toBe('chain unknown_chain');
    expect(span.data?.[GEN_AI_PIPELINE_NAME]).toBeUndefined();
    expect(span.data?.['langchain.chain.name']).toBeUndefined();
  });

  it('leads with the operation and keeps the chain name when span streaming is enabled', () => {
    const endedSpans = setupClient('stream');
    runChain('format_prompt');

    const span = spanToStaticSpanJSON(endedSpans[0]!);
    expect(span.description).toBe('invoke_agent format_prompt');
    expect(span.data?.[GEN_AI_OPERATION_NAME]).toBe('invoke_agent');
    expect(span.data?.[GEN_AI_PIPELINE_NAME]).toBe('format_prompt');
    expect(span.data?.['langchain.chain.name']).toBeUndefined();
  });

  it('drops the `unknown_chain` sentinel when span streaming is enabled', () => {
    const endedSpans = setupClient('stream');
    runChain();

    const span = spanToStaticSpanJSON(endedSpans[0]!);
    expect(span.description).toBe('invoke_agent');
    expect(span.data?.[GEN_AI_PIPELINE_NAME]).toBeUndefined();
    expect(span.data?.['langchain.chain.name']).toBeUndefined();
  });
});
