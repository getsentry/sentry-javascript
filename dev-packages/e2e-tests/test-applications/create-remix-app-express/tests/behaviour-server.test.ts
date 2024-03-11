import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from 'event-proxy-server';

test('Sends a loader error to Sentry', async ({ page }) => {
  const loaderErrorPromise = waitForError('create-remix-app-express', errorEvent => {
    return errorEvent.exception.values[0].value === 'Loader Error';
  });

  await page.goto('/loader-error');

  const loaderError = await loaderErrorPromise;

  expect(loaderError).toBeDefined();
  expect(loaderError.contexts.trace.op).toBe('http.server');
});

test('Sends formdata with action error to Sentry', async ({ page }, workerInfo) => {
  await page.goto('/action-formdata');

  await page.fill('input[name=test]', 'test');
  await page.setInputFiles('input[type=file]', `${workerInfo.project.testDir}/static/test.txt`);

  const formdataActionTransaction = waitForTransaction('create-remix-app-express', transactionEvent => {
    return transactionEvent?.spans?.some(span => span.op === 'function.remix.action');
  });

  await page.click('button[type=submit]');

  const actionTransaction = await formdataActionTransaction;

  expect(actionTransaction).toBeDefined();
  expect(actionTransaction.contexts.trace.op).toBe('http.server');
  expect(actionTransaction.spans[0].data).toMatchObject({
    action_form_data_test: 'test',
    action_form_data_file: 'test.txt',
  });
});
