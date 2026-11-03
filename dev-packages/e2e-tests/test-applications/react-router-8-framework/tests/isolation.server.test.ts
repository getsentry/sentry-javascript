import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';
import { APP_NAME } from './constants';

test('keeps the scope data of concurrent requests apart', async ({ request }) => {
  const eventAPromise = waitForError(APP_NAME, event => event.message === 'isolation a');
  const eventBPromise = waitForError(APP_NAME, event => event.message === 'isolation b');

  await Promise.all([request.get('/isolation/a?partner=b'), request.get('/isolation/b?partner=a')]);

  expect((await eventAPromise).tags).toMatchObject({ 'isolation-id': 'a' });
  expect((await eventBPromise).tags).toMatchObject({ 'isolation-id': 'b' });
});
