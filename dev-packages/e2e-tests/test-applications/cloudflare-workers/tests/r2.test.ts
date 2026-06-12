import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('R2 put and get create spans', async ({ baseURL }) => {
  const transactionWaiter = waitForTransaction('cloudflare-workers', event => {
    return event.spans?.some(span => span.description === 'r2_put') ?? false;
  });

  const response = await fetch(`${baseURL}/r2/put-get`);
  expect(response.status).toBe(200);
  await expect(response.text()).resolves.toBe('test-value');

  const transaction = await transactionWaiter;

  const putSpan = transaction.spans?.find(span => span.description === 'r2_put');
  expect(putSpan).toBeDefined();
  expect(putSpan?.op).toBe('cloud.r2');
  expect(putSpan?.data?.['cloudflare.r2.operation']).toBe('PutObject');
  expect(putSpan?.data?.['cloudflare.r2.bucket']).toBe('MY_BUCKET');
  expect(putSpan?.data?.['cloudflare.r2.request.key']).toBe('test-key.txt');
  expect(putSpan?.data?.['sentry.origin']).toBe('auto.faas.cloudflare.r2');

  const getSpan = transaction.spans?.find(span => span.description === 'r2_get');
  expect(getSpan).toBeDefined();
  expect(getSpan?.op).toBe('cloud.r2');
  expect(getSpan?.data?.['cloudflare.r2.operation']).toBe('GetObject');
  expect(getSpan?.data?.['cloudflare.r2.request.key']).toBe('test-key.txt');
});

test('R2 head creates a span', async ({ baseURL }) => {
  const transactionWaiter = waitForTransaction('cloudflare-workers', event => {
    return event.spans?.some(span => span.description === 'r2_head') ?? false;
  });

  const response = await fetch(`${baseURL}/r2/head`);
  expect(response.status).toBe(200);

  const transaction = await transactionWaiter;

  const headSpan = transaction.spans?.find(span => span.description === 'r2_head');
  expect(headSpan).toBeDefined();
  expect(headSpan?.op).toBe('cloud.r2');
  expect(headSpan?.data?.['cloudflare.r2.operation']).toBe('HeadObject');
  expect(headSpan?.data?.['cloudflare.r2.request.key']).toBe('head-key.txt');
});

test('R2 list creates a span', async ({ baseURL }) => {
  const transactionWaiter = waitForTransaction('cloudflare-workers', event => {
    return event.spans?.some(span => span.description === 'r2_list') ?? false;
  });

  const response = await fetch(`${baseURL}/r2/list`);
  expect(response.status).toBe(200);

  const transaction = await transactionWaiter;

  const listSpan = transaction.spans?.find(span => span.description === 'r2_list');
  expect(listSpan).toBeDefined();
  expect(listSpan?.op).toBe('cloud.r2');
  expect(listSpan?.data?.['cloudflare.r2.operation']).toBe('ListObjects');
  expect(listSpan?.data?.['cloudflare.r2.request.key']).toBeUndefined();
});

test('R2 delete creates a span', async ({ baseURL }) => {
  const transactionWaiter = waitForTransaction('cloudflare-workers', event => {
    return event.spans?.some(span => span.description === 'r2_delete') ?? false;
  });

  const response = await fetch(`${baseURL}/r2/delete`);
  expect(response.status).toBe(200);

  const transaction = await transactionWaiter;

  const deleteSpan = transaction.spans?.find(span => span.description === 'r2_delete');
  expect(deleteSpan).toBeDefined();
  expect(deleteSpan?.op).toBe('cloud.r2');
  expect(deleteSpan?.data?.['cloudflare.r2.operation']).toBe('DeleteObject');
  expect(deleteSpan?.data?.['cloudflare.r2.request.key']).toBe('delete-me.txt');
});

test('R2 multipart upload creates spans for each operation', async ({ baseURL }) => {
  const transactionWaiter = waitForTransaction('cloudflare-workers', event => {
    return event.spans?.some(span => span.description === 'r2_createMultipartUpload') ?? false;
  });

  const response = await fetch(`${baseURL}/r2/multipart`);
  expect(response.status).toBe(200);

  const transaction = await transactionWaiter;

  const createSpan = transaction.spans?.find(span => span.description === 'r2_createMultipartUpload');
  expect(createSpan).toBeDefined();
  expect(createSpan?.op).toBe('cloud.r2');
  expect(createSpan?.data?.['cloudflare.r2.operation']).toBe('CreateMultipartUpload');
  expect(createSpan?.data?.['cloudflare.r2.request.key']).toBe('multipart.bin');

  const uploadPartSpans = transaction.spans?.filter(span => span.description === 'r2_uploadPart');
  expect(uploadPartSpans).toHaveLength(2);
  expect(uploadPartSpans?.[0]?.data?.['cloudflare.r2.operation']).toBe('UploadPart');
  expect(uploadPartSpans?.[0]?.data?.['cloudflare.r2.request.key']).toBe('multipart.bin');
  expect(uploadPartSpans?.[0]?.data?.['cloudflare.r2.request.part_number']).toBe(1);
  expect(uploadPartSpans?.[1]?.data?.['cloudflare.r2.request.part_number']).toBe(2);

  const completeSpan = transaction.spans?.find(span => span.description === 'r2_completeMultipartUpload');
  expect(completeSpan).toBeDefined();
  expect(completeSpan?.data?.['cloudflare.r2.operation']).toBe('CompleteMultipartUpload');
  expect(completeSpan?.data?.['cloudflare.r2.request.key']).toBe('multipart.bin');
});
