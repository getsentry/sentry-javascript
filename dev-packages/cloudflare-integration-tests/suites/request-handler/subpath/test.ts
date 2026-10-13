import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';

it('captures a transaction via wrapRequestHandler from the /request subpath without node compatibility flags', async ({
  signal,
}) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as any;
      expect(transactionEvent.transaction).toBe('GET /');
      expect(transactionEvent.contexts?.trace?.op).toBe('http.server');
      expect(transactionEvent.contexts?.trace?.origin).toBe('auto.http.cloudflare');
    })
    .start(signal);

  await runner.makeRequest('get', '/');
  await runner.completed();
});
