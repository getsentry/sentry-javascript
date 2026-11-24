import type { APIRequestContext } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { nitroChannels } from '@sentry/server-utils/orchestrion/config';
import { readFileSync } from 'node:fs';
import { MAIN_THREAD_RECORDS_FILE } from '../main-thread-records.mjs';

type ChannelRecord = { channel: string; event: string } & Record<string, unknown>;

const isDev = process.env.TEST_ENV === 'development' || process.env.TEST_ENV === 'dev-nitro';

async function getRecords(request: APIRequestContext): Promise<ChannelRecord[]> {
  const response = await request.get('/api/channels');
  return response.json();
}

function getMainThreadRecords(): ChannelRecord[] {
  try {
    return JSON.parse(readFileSync(MAIN_THREAD_RECORDS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

test('useNitroApp end carries the Nitro app as its result', async ({ request }) => {
  await request.get('/api/test-param/123');

  await expect
    .poll(() => getRecords(request))
    .toContainEqual({
      channel: nitroChannels.NITRO_USE_NITRO_APP,
      event: 'end',
      resultKeys: expect.arrayContaining(['captureError', 'fetch', 'h3']),
    });
});

test('prepareResponse receives the event with its matched route', async ({ request }) => {
  await request.get('/api/test-param/123');

  await expect
    .poll(() => getRecords(request))
    .toContainEqual({
      channel: nitroChannels.H3_PREPARE_RESPONSE,
      event: 'start',
      path: '/api/test-param/123',
      matchedRoute: '/api/test-param/:id',
    });
});

test('prepareResponse receives a thrown error', async ({ request }) => {
  const response = await request.get('/api/test-error');
  expect(response.status()).toBe(500);

  await expect
    .poll(() => getRecords(request))
    .toContainEqual(
      expect.objectContaining({
        channel: nitroChannels.H3_PREPARE_RESPONSE,
        event: 'start',
        path: '/api/test-error',
        matchedRoute: '/api/test-error',
        error: 'This is a test error',
      }),
    );
  // h3 calls it again with the response of `onError`.
  expect(await getRecords(request)).toContainEqual(
    expect.objectContaining({
      channel: nitroChannels.H3_PREPARE_RESPONSE,
      event: 'start',
      path: '/api/test-error',
      nested: true,
    }),
  );
});

test('H3Core handler and callLayer fire for a request', async ({ request }) => {
  await request.get('/api/test-param/456');

  const records = await getRecords(request);
  expect(records).toContainEqual({
    channel: nitroChannels.H3_CORE_HANDLER,
    event: 'start',
    path: '/api/test-param/456',
  });
  expect(records).toContainEqual({ channel: nitroChannels.H3_CALL_LAYER, event: 'start', path: '/api/test-param/456' });
});

test('runTask reports the error of a failing task', async ({ request }) => {
  await request.get('/api/test-task-error');

  const records = await getRecords(request);
  expect(records).toContainEqual(
    expect.objectContaining({ channel: nitroChannels.NITRO_RUN_TASK, event: 'start', name: 'test-error' }),
  );
  expect(records).toContainEqual({
    channel: nitroChannels.NITRO_RUN_TASK,
    event: 'error',
    name: 'test-error',
    error: 'This is a task error',
  });
});

test('runTask fires for a scheduled task', async ({ request }) => {
  await expect
    .poll(() => getRecords(request))
    .toContainEqual(
      expect.objectContaining({ channel: nitroChannels.NITRO_RUN_TASK, event: 'start', name: 'test-scheduled' }),
    );
});

test('the NitroDevApp constructor fires on the dev server only', async () => {
  if (isDev) {
    expect(getMainThreadRecords()).toContainEqual({
      channel: nitroChannels.NITRO_DEV_APP,
      event: 'end',
      hasFetch: true,
    });
  } else {
    expect(getMainThreadRecords()).toEqual([]);
  }
});
