import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test('Should emit a span for a generateMetadata() function invocation', async ({ page }) => {
  const testTitle = 'should-emit-span';

  const transactionPromise = waitForTransaction('nextjs-14', async transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.data?.['http.target'] === `/generation-functions?metadataTitle=${testTitle}`
    );
  });

  await page.goto(`/generation-functions?metadataTitle=${testTitle}`);

  const transaction = await transactionPromise;

  expect(transaction.spans).toContainEqual(
    expect.objectContaining({
      description: 'generateMetadata /generation-functions/page',
      origin: 'auto',
      parent_span_id: expect.any(String),
      span_id: expect.any(String),
      status: 'ok',
      trace_id: expect.any(String),
    }),
  );

  const pageTitle = await page.title();
  expect(pageTitle).toBe(testTitle);
});

test('Should send a transaction and an error event for a faulty generateMetadata() function invocation', async ({
  page,
}) => {
  const testTitle = 'should-emit-error';

  const transactionPromise = waitForTransaction('nextjs-14', async transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.data?.['http.target'] ===
      `/generation-functions?metadataTitle=${testTitle}&shouldThrowInGenerateMetadata=1`
    );
  });

  const errorEventPromise = waitForError('nextjs-14', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'generateMetadata Error';
  });

  await page.goto(`/generation-functions?metadataTitle=${testTitle}&shouldThrowInGenerateMetadata=1`);

  const errorEvent = await errorEventPromise;
  const transactionEvent = await transactionPromise;

  expect(errorEvent.transaction).toBe('Page.generateMetadata (/generation-functions)');

  // Assert that isolation scope works properly
  expect(errorEvent.tags?.['my-isolated-tag']).toBe(true);
  expect(errorEvent.tags?.['my-global-scope-isolated-tag']).not.toBeDefined();
  expect(transactionEvent.tags?.['my-isolated-tag']).toBe(true);
  expect(transactionEvent.tags?.['my-global-scope-isolated-tag']).not.toBeDefined();
});

test('Should send a transaction event for a generateViewport() function invocation', async ({ page }) => {
  const testTitle = 'floob';

  const transactionPromise = waitForTransaction('nextjs-14', async transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.data?.['http.target'] ===
      `/generation-functions?viewportThemeColor=${testTitle}`
    );
  });

  await page.goto(`/generation-functions?viewportThemeColor=${testTitle}`);

  expect((await transactionPromise).spans).toContainEqual(
    expect.objectContaining({
      description: 'generateViewport /generation-functions/page',
      origin: 'auto',
      parent_span_id: expect.any(String),
      span_id: expect.any(String),
      status: 'ok',
      trace_id: expect.any(String),
    }),
  );
});

test('Should send a transaction and an error event for a faulty generateViewport() function invocation', async ({
  page,
}) => {
  const testTitle = 'blargh';

  const transactionPromise = waitForTransaction('nextjs-14', async transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.data?.['http.target'] ===
      `/generation-functions?viewportThemeColor=${testTitle}&shouldThrowInGenerateViewport=1`
    );
  });

  const errorEventPromise = waitForError('nextjs-14', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'generateViewport Error';
  });

  await page.goto(`/generation-functions?viewportThemeColor=${testTitle}&shouldThrowInGenerateViewport=1`);

  expect(await transactionPromise).toBeDefined();
  expect(await errorEventPromise).toBeDefined();

  const errorEvent = await errorEventPromise;

  expect(errorEvent.transaction).toBe('Page.generateViewport (/generation-functions)');
});

test('Should send a transaction event with correct status for a generateMetadata() function invocation with redirect()', async ({
  page,
}) => {
  const testTitle = 'redirect-foobar';

  const transactionPromise = waitForTransaction('nextjs-14', async transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.data?.['http.target'] ===
      `/generation-functions/with-redirect?metadataTitle=${testTitle}`
    );
  });

  await page.goto(`/generation-functions/with-redirect?metadataTitle=${testTitle}`);

  expect((await transactionPromise).contexts?.trace?.status).toBe('ok');
});

test('Should send a transaction event with correct status for a generateMetadata() function invocation with notfound()', async ({
  page,
}) => {
  const testTitle = 'notfound-foobar';

  const transactionPromise = waitForTransaction('nextjs-14', async transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.data?.['http.target'] ===
      `/generation-functions/with-notfound?metadataTitle=${testTitle}`
    );
  });

  await page.goto(`/generation-functions/with-notfound?metadataTitle=${testTitle}`);

  expect((await transactionPromise).contexts?.trace?.status).toBe('not_found');
});
