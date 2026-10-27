import { GEN_AI_INPUT_MESSAGES } from '@sentry/conventions/attributes';
import { getClient, getMainCarrier, setCurrentClient, spanToStaticSpanJSON } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { markEveGenAiRecordingDefault } from '../../../src/integrations/vercel-ai/gen-ai-recording-mode';
import { createSpanFromMessage } from '../../../src/integrations/vercel-ai/vercel-ai-dc-subscriber';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

// eve stamps every AI SDK call with `recordInputs: false`, which the channel subscriber otherwise
// honors over the global default. `eveIntegration()` (via `markEveGenAiRecordingDefault`) flips that so
// content is recorded by default under eve, while explicit settings still win.
describe('Vercel AI recording under eve', () => {
  beforeEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
  });

  afterEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
  });

  function setupClient(dataCollection: { genAI?: { inputs?: boolean } } = {}): void {
    const client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
        tracesSampleRate: 1,
        dataCollection,
      }),
    );
    setCurrentClient(client);
    client.init();
  }

  // A `generateText` operation carrying input messages and eve's per-call `recordInputs: false`.
  function recordedInputMessages(): unknown {
    const message = {
      type: 'generateText',
      event: {
        messages: [{ role: 'user', content: 'What is the weather in Paris?' }],
        recordInputs: false,
      },
    } as Parameters<typeof createSpanFromMessage>[0];
    const span = createSpanFromMessage(message, {});
    return (spanToStaticSpanJSON(span!).data ?? {})[GEN_AI_INPUT_MESSAGES];
  }

  it('honors the per-call recordInputs:false without eve mode', () => {
    setupClient();

    expect(recordedInputMessages()).toBeUndefined();
  });

  it('records inputs by default under eve despite the per-call recordInputs:false', () => {
    setupClient();
    markEveGenAiRecordingDefault(getClient()!);

    expect(recordedInputMessages()).toContain('What is the weather in Paris?');
  });

  it('still honors an explicit dataCollection.genAI opt-out under eve', () => {
    setupClient({ genAI: { inputs: false } });
    markEveGenAiRecordingDefault(getClient()!);

    expect(recordedInputMessages()).toBeUndefined();
  });
});
