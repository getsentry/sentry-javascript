import { expect, test } from '@playwright/test';
import { waitForEnvelopeItem } from '@sentry-internal/test-utils';
import { APP_NAME } from './constants';

test('sends a log from a server loader', async ({ request }) => {
  const logEnvelopeItemPromise = waitForEnvelopeItem(APP_NAME, ([header, body]) => {
    return (
      header.type === 'log' &&
      (body as { items: { body: string }[] }).items.some(log => log.body === 'react-router server log')
    );
  });

  await request.get('/logs');

  const [, body] = await logEnvelopeItemPromise;
  const log = (body as { items: { body: string }[] }).items.find(item => item.body === 'react-router server log');

  expect(log).toMatchObject({
    level: 'info',
    attributes: { route: { value: 'logs', type: 'string' } },
  });
});
