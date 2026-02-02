import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { isNext13 } from './nextjsVersion';

test('Will create a transaction with spans for every server component and metadata generation functions when visiting a page', async ({
  page,
}) => {
  const serverTransactionEventPromise = waitForTransaction('nextjs-app-dir', async transactionEvent => {
    return transactionEvent?.transaction === 'GET /nested-layout';
  });

  await page.goto('/nested-layout');

  const spanDescriptions = (await serverTransactionEventPromise).spans?.map(span => {
    return span.description;
  });

  expect(spanDescriptions).toContainEqual('render route (app) /nested-layout');
  expect(spanDescriptions).toContainEqual('generateMetadata /(nested-layout)/nested-layout/page');

  // Next.js 13 has limited OTEL support for server components, so we don't expect to see the following spans
  if (!isNext13) {
    expect(spanDescriptions).toContainEqual('resolve page components');
    expect(spanDescriptions).toContainEqual('build component tree');
    expect(spanDescriptions).toContainEqual('resolve root layout server component');
    expect(spanDescriptions).toContainEqual('resolve layout server component "(nested-layout)"');
    expect(spanDescriptions).toContainEqual('resolve layout server component "nested-layout"');
    expect(spanDescriptions).toContainEqual('resolve page server component "/nested-layout"');
    expect(spanDescriptions).toContainEqual('start response');
  }
});

test('Will create a transaction with spans for every server component and metadata generation functions when visiting a dynamic page', async ({
  page,
}) => {
  const serverTransactionEventPromise = waitForTransaction('nextjs-app-dir', async transactionEvent => {
    return transactionEvent?.transaction === 'GET /nested-layout/[dynamic]';
  });

  await page.goto('/nested-layout/123');

  const spanDescriptions = (await serverTransactionEventPromise).spans?.map(span => {
    return span.description;
  });

  expect(spanDescriptions).toContainEqual('render route (app) /nested-layout/[dynamic]');
  expect(spanDescriptions).toContainEqual('generateMetadata /(nested-layout)/nested-layout/[dynamic]/page');

  // Next.js 13 has limited OTEL support for server components, so we don't expect to see the following spans
  if (!isNext13) {
    expect(spanDescriptions).toContainEqual('resolve page components');
    expect(spanDescriptions).toContainEqual('build component tree');
    expect(spanDescriptions).toContainEqual('resolve root layout server component');
    expect(spanDescriptions).toContainEqual('resolve layout server component "(nested-layout)"');
    expect(spanDescriptions).toContainEqual('resolve layout server component "nested-layout"');
    expect(spanDescriptions).toContainEqual('resolve layout server component "[dynamic]"');
    expect(spanDescriptions).toContainEqual('resolve page server component "/nested-layout/[dynamic]"');
    expect(spanDescriptions).toContainEqual('start response');
  }
});
