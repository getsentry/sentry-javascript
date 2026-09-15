import { tracingChannel } from 'node:diagnostics_channel';
import { GLOBAL_OBJ, setCurrentClient } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mastraIntegration } from '../../../src/integrations/mastra';
import { CHANNELS } from '../../../src/orchestrion/channels';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

const channel = tracingChannel<{ error: unknown; arguments: unknown[] }>(CHANNELS.MASTRA_EXECUTE_WITH_CONTEXT);

describe('mastraIntegration error capture', () => {
  let client: TestClient;

  beforeEach(() => {
    // Treat `@mastra/core` as already injected so the channel subscription activates synchronously.
    GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = { runtime: ['@mastra/core'] };
    client = new TestClient(
      getDefaultTestClientOptions({ dsn: 'https://public@dsn.ingest.sentry.io/1337', tracesSampleRate: 1 }),
    );
    setCurrentClient(client);
    client.init();
    mastraIntegration().setup?.(client);
  });

  afterEach(() => {
    delete GLOBAL_OBJ.__SENTRY_ORCHESTRION__;
    vi.restoreAllMocks();
  });

  it('captures an error thrown by a Mastra operation as an issue', () => {
    const captureException = vi.spyOn(client, 'captureException');

    const error = new Error('tool blew up');
    channel.error.publish({ error, arguments: [{}] });

    expect(captureException).toHaveBeenCalledTimes(1);
    // The captured value is the thrown error itself (real stack), with the Mastra mechanism.
    expect(captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ mechanism: { type: 'auto.ai.mastra', handled: false } }),
      expect.anything(),
    );
  });

  it('captures the same error only once when Mastra re-wraps it as a MastraError', () => {
    const captureException = vi.spyOn(client, 'captureException');

    const original = new Error('tool blew up');
    // Mastra rethrows failures wrapped in `new MastraError({ cause })` — a *different* object.
    const wrapped = new Error('Tool execution failed');
    (wrapped as Error & { cause?: unknown }).cause = original;

    // The raw error surfaces at the inner operation, the wrapper at an outer one.
    channel.error.publish({ error: original, arguments: [{}] });
    channel.error.publish({ error: wrapped, arguments: [{}] });

    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('captures unrelated errors separately', () => {
    const captureException = vi.spyOn(client, 'captureException');

    channel.error.publish({ error: new Error('first'), arguments: [{}] });
    channel.error.publish({ error: new Error('second'), arguments: [{}] });

    expect(captureException).toHaveBeenCalledTimes(2);
  });
});
