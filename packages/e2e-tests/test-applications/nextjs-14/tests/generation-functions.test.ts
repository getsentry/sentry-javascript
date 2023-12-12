import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '../event-proxy-server';

test('Should send a transaction event for a generateMetadata() function invokation', async ({ page }, testInfo) => {
  const transactionPromise = waitForTransaction('nextjs-14', async transactionEvent => {
    return (
      transactionEvent?.transaction === 'Page.generateMetadata (/generation-functions)' &&
      transactionEvent.contexts?.trace?.data?.['searchParams']?.['metadataTitle'] === testInfo.testId
    );
  });

  await page.goto(`/generation-functions?metadataTitle=${testInfo.testId}`);

  expect(await transactionPromise).toBeDefined();

  const pageTitle = await page.title();
  expect(pageTitle).toBe(testInfo.testId);
});

test('Should send a transaction and an error event for a faulty generateMetadata() function invokation', async ({
  page,
}, testInfo) => {
  const transactionPromise = waitForTransaction('nextjs-14', async transactionEvent => {
    return (
      transactionEvent?.transaction === 'Page.generateMetadata (/generation-functions)' &&
      transactionEvent.contexts?.trace?.data?.['searchParams']?.['metadataTitle'] === testInfo.testId
    );
  });

  const errorEventPromise = waitForError('nextjs-14', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'generateMetadata Error';
  });

  await page.goto(`/generation-functions?metadataTitle=${testInfo.testId}&shouldThrowInGenerateMetadata=1`);

  expect(await transactionPromise).toBeDefined();
  expect(await errorEventPromise).toBeDefined();
});

test('Should send a transaction event for a generateViewport() function invokation', async ({ page }, testInfo) => {
  const transactionPromise = waitForTransaction('nextjs-14', async transactionEvent => {
    return (
      transactionEvent?.transaction === 'Page.generateViewport (/generation-functions)' &&
      transactionEvent.contexts?.trace?.data?.['searchParams']?.['viewportThemeColor'] === testInfo.testId
    );
  });

  await page.goto(`/generation-functions?viewportThemeColor=${testInfo.testId}`);

  expect(await transactionPromise).toBeDefined();
});

test('Should send a transaction and an error event for a faulty generateViewport() function invokation', async ({
  page,
}, testInfo) => {
  const transactionPromise = waitForTransaction('nextjs-14', async transactionEvent => {
    return (
      transactionEvent?.transaction === 'Page.generateViewport (/generation-functions)' &&
      transactionEvent.contexts?.trace?.data?.['searchParams']?.['viewportThemeColor'] === testInfo.testId
    );
  });

  const errorEventPromise = waitForError('nextjs-14', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'generateViewport Error';
  });

  await page.goto(`/generation-functions?viewportThemeColor=${testInfo.testId}&shouldThrowInGenerateViewport=1`);

  expect(await transactionPromise).toBeDefined();
  expect(await errorEventPromise).toBeDefined();
});
