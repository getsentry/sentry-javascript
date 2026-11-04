import type { Event } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';

it('parameterize from the public entry sends a message template and its values', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const event = envelope[1]?.[0]?.[1] as Event;
      expect(event.logentry).toEqual({ message: 'User %s logged in', params: [42] });
    })
    .start(signal);

  await runner.makeRequest('get', '/');
  await runner.completed();
});
