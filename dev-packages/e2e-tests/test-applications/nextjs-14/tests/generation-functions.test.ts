import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '../event-proxy-server';

test('Should send a transaction event for a generateMetadata() function invokation', async ({ page }) => {
  const testTitle = 'foobarasdf';

  const transactionPromise = waitForTransaction('nextjs-14', async transactionEvent => {
    return (
      transactionEvent?.transaction === 'Page.generateMetadata (/generation-functions)' &&
      (transactionEvent.extra?.route_data as any)?.searchParams?.metadataTitle === testTitle
    );
  });

  await page.goto(`/generation-functions?metadataTitle=${testTitle}`);

  expect(await transactionPromise).toBeDefined();

  const pageTitle = await page.title();
  expect(pageTitle).toBe(testTitle);
});

test('Should send a transaction and an error event for a faulty generateMetadata() function invokation', async ({
  page,
}) => {
  const testTitle = 'foobarbaz';

  const transactionPromise = waitForTransaction('nextjs-14', async transactionEvent => {
    return (
      transactionEvent.transaction === 'Page.generateMetadata (/generation-functions)' &&
      (transactionEvent.extra?.route_data as any)?.searchParams?.metadataTitle === testTitle
    );
  });

  const errorEventPromise = waitForError('nextjs-14', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'generateMetadata Error';
  });

  await page.goto(`/generation-functions?metadataTitle=${testTitle}&shouldThrowInGenerateMetadata=1`);

  expect(await transactionPromise).toBeDefined();
  expect(await errorEventPromise).toBeDefined();
});

test('Should send a transaction event for a generateViewport() function invokation', async ({ page }) => {
  const testTitle = 'floob';

  const transactionPromise = waitForTransaction('nextjs-14', async transactionEvent => {
    return (
      transactionEvent?.transaction === 'Page.generateViewport (/generation-functions)' &&
      (transactionEvent.extra?.route_data as any)?.searchParams?.viewportThemeColor === testTitle
    );
  });

  await page.goto(`/generation-functions?viewportThemeColor=${testTitle}`);

  expect(await transactionPromise).toBeDefined();
});

test('Should send a transaction and an error event for a faulty generateViewport() function invokation', async ({
  page,
}) => {
  const testTitle = 'blargh';

  const transactionPromise = waitForTransaction('nextjs-14', async transactionEvent => {
    return (
      transactionEvent?.transaction === 'Page.generateViewport (/generation-functions)' &&
      (transactionEvent.extra?.route_data as any)?.searchParams?.viewportThemeColor === testTitle
    );
  });

  const errorEventPromise = waitForError('nextjs-14', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'generateViewport Error';
  });

  await page.goto(`/generation-functions?viewportThemeColor=${testTitle}&shouldThrowInGenerateViewport=1`);

  expect(await transactionPromise).toBeDefined();
  expect(await errorEventPromise).toBeDefined();
});

test('Should send a transaction event with correct status for a generateMetadata() function invokation with redirect()', async ({
  page,
}) => {
  const testTitle = 'redirect-foobar';

  const transactionPromise = waitForTransaction('nextjs-14', async transactionEvent => {
    return (
      transactionEvent?.transaction === 'Page.generateMetadata (/generation-functions/with-redirect)' &&
      (transactionEvent.extra?.route_data as any)?.searchParams?.metadataTitle === testTitle
    );
  });

  await page.goto(`/generation-functions/with-redirect?metadataTitle=${testTitle}`);

  expect((await transactionPromise).contexts?.trace?.status).toBe('ok');
});

test('Should send a transaction event with correct status for a generateMetadata() function invokation with notfound()', async ({
  page,
}) => {
  const testTitle = 'notfound-foobar';

  const transactionPromise = waitForTransaction('nextjs-14', async transactionEvent => {
    return (
      transactionEvent?.transaction === 'Page.generateMetadata (/generation-functions/with-notfound)' &&
      (transactionEvent.extra?.route_data as any)?.searchParams?.metadataTitle === testTitle
    );
  });

  await page.goto(`/generation-functions/with-notfound?metadataTitle=${testTitle}`);

  expect((await transactionPromise).contexts?.trace?.status).toBe('not_found');
});
