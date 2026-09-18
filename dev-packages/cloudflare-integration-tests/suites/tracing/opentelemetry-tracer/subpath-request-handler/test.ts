import type { Event } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../../../runner';

it('does not capture spans emitted through @opentelemetry/api inside wrapRequestHandler from the /request subpath', async ({
  signal,
}) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const event = envelope[1]?.[0]?.[1] as Event;
      expect(event.transaction).toBe('GET /');
      expect(event.contexts?.trace?.op).toBe('http.server');
      expect(event.spans).toEqual([]);
    })
    .start(signal);

  await runner.makeRequest('get', '/');
  await runner.completed();
});
