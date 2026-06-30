import { expect, it } from 'vitest';
import { eventEnvelope } from '../../../expect';
import { createRunner } from '../../../runner';

it('omits the span name from the DSC for url-source spans when tracing is enabled', async ({ signal }) => {
  const runner = createRunner(__dirname)
    // Error event: because tracing is enabled, the DSC carries the sampling fields. But the span
    // source is `url`, so the span name is omitted from the DSC (raw URLs may contain PII).
    .expect(
      eventEnvelope(
        {
          level: 'error',
          exception: {
            values: [
              {
                type: 'Error',
                value: 'Test error from URL-source worker',
                stacktrace: {
                  frames: expect.any(Array),
                },
                mechanism: { type: 'auto.http.cloudflare', handled: false },
              },
            ],
          },
          request: {
            headers: expect.any(Object),
            method: 'GET',
            url: expect.any(String),
          },
        },
        { includeSamplingFields: true, includeSampleRand: true, includeTransaction: false },
      ),
    )
    // Transaction event: proves we are NOT in TwP — the span is recorded with a `url` source and
    // carries the name on the event itself, even though it is intentionally absent from the DSC.
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1];
      expect(transactionEvent).toEqual(
        expect.objectContaining({
          type: 'transaction',
          transaction: 'GET /error',
          contexts: expect.objectContaining({
            trace: expect.objectContaining({
              op: 'http.server',
              data: expect.objectContaining({ 'sentry.source': 'url' }),
            }),
          }),
        }),
      );
    })
    .unordered()
    .start(signal);
  await runner.makeRequest('get', '/error', { expectError: true });
  await runner.completed();
});
