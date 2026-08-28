import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

type StreamedSpan = Awaited<ReturnType<typeof waitForStreamedSpan>>;

// This test should be run in serial mode to ensure that the test user is created before the other tests
test.describe.configure({ mode: 'serial' });

const DB_ATTRIBUTES = {
  'db.system.name': { value: 'postgresql', type: 'string' },
  'sentry.op': { value: 'db', type: 'string' },
  'sentry.origin': { value: 'auto.db.supabase', type: 'string' },
};

function collectSpansUntilSegment(segmentName: string): Promise<StreamedSpan[]> {
  return collectStreamedSpans('supabase-nextjs', spans =>
    spans.some(span => span.name === segmentName && span.is_segment),
  );
}

function expectDbSpan(
  span: StreamedSpan | undefined,
  name: string,
  attributes: Record<string, unknown>,
): asserts span is StreamedSpan {
  expect(span).toEqual(
    expect.objectContaining({
      name,
      status: 'ok',
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      start_timestamp: expect.any(Number),
      end_timestamp: expect.any(Number),
    }),
  );
  expect(getSpanOp(span!)).toBe('db');
  expect(span!.attributes).toMatchObject({ ...DB_ATTRIBUTES, ...attributes });
}

// This should be the first test as it will be needed for the other tests
test('Sends server-side Supabase auth admin `createUser` span', async ({ baseURL }) => {
  const spansPromise = collectSpansUntilSegment('GET /api/create-test-user');

  await fetch(`${baseURL}/api/create-test-user`);
  const spans = await spansPromise;

  const rootSpan = spans.find(span => span.name === 'GET /api/create-test-user' && span.is_segment)!;
  const createUserSpan = spans.find(span => span.name === 'auth.admin.createUser');

  expectDbSpan(createUserSpan, 'auth.admin.createUser', {
    'db.operation.name': { value: 'auth.admin.createUser', type: 'string' },
  });
  expect(createUserSpan.is_segment).toBe(false);
  expect(createUserSpan.trace_id).toBe(rootSpan.trace_id);
  expect(createUserSpan.parent_span_id).toEqual(expect.stringMatching(/[a-f0-9]{16}/));
});

test('Sends client-side Supabase db-operation spans to Sentry', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('supabase-nextjs', span => {
    return span.name === '/' && getSpanOp(span) === 'pageload' && span.is_segment;
  });

  // The `order` filter only exists on the client-side select, which keeps it distinguishable from the
  // server-side selects now that the span name no longer carries the filters.
  const selectSpanPromise = waitForStreamedSpan('supabase-nextjs', span => {
    const query = span.attributes['db.query'];
    return (
      span.name === 'select todos' &&
      query?.type === 'array' &&
      (query.value as unknown[]).includes('filter(order, asc)')
    );
  });

  const insertSpanPromise = waitForStreamedSpan('supabase-nextjs', span => span.name === 'insert todos');

  await page.goto('/');

  // Fill in login credentials
  // The email and password should be the same as the ones used in the `create-test-user` endpoint
  await page.locator('input[name=email]').fill('test@sentry.test');
  await page.locator('input[name=password]').fill('sentry.test');
  await page.locator('button[type=submit]').click();

  // Wait for login to complete
  await page.waitForSelector('button:has-text("Add")');

  // Add a new todo entry
  await page.locator('input[id=new-task-text]').fill('test');
  await page.locator('button[id=add-task]').click();

  const [pageloadSpan, selectSpan, insertSpan] = await Promise.all([
    pageloadSpanPromise,
    selectSpanPromise,
    insertSpanPromise,
  ]);

  // Client-side database query data is collected by default.
  expectDbSpan(selectSpan, 'select todos', {
    'db.operation.name': { value: 'select', type: 'string' },
    'db.query': { value: ['select(*)', 'filter(order, asc)'], type: 'array' },
  });
  expect(selectSpan.trace_id).toBe(pageloadSpan.trace_id);

  // The insert is triggered long after the pageload span has ended, so it is streamed on its own
  // rather than as a child of the pageload span.
  expectDbSpan(insertSpan, 'insert todos', {
    'db.operation.name': { value: 'insert', type: 'string' },
    'db.query': { value: ['select(*)'], type: 'array' },
  });
});

test('Sends server-side Supabase db-operation spans to Sentry', async ({ baseURL }) => {
  const spansPromise = collectSpansUntilSegment('GET /api/add-todo-entry');

  await fetch(`${baseURL}/api/add-todo-entry`);
  const spans = await spansPromise;

  const rootSpan = spans.find(span => span.name === 'GET /api/add-todo-entry' && span.is_segment)!;
  const insertSpan = spans.find(span => span.name === 'insert todos');
  const selectSpan = spans.find(span => span.name === 'select todos');

  expectDbSpan(insertSpan, 'insert todos', {
    'db.operation.name': { value: 'insert', type: 'string' },
    'db.query': { value: ['select(*)'], type: 'array' },
  });
  expect(insertSpan.is_segment).toBe(false);
  expect(insertSpan.trace_id).toBe(rootSpan.trace_id);

  expectDbSpan(selectSpan, 'select todos', {
    'db.operation.name': { value: 'select', type: 'string' },
    'db.query': { value: ['select(*)'], type: 'array' },
  });
  expect(selectSpan.is_segment).toBe(false);
  expect(selectSpan.trace_id).toBe(rootSpan.trace_id);
});

test('Sends server-side Supabase auth admin `listUsers` span', async ({ baseURL }) => {
  const spansPromise = collectSpansUntilSegment('GET /api/list-users');

  await fetch(`${baseURL}/api/list-users`);
  const spans = await spansPromise;

  const rootSpan = spans.find(span => span.name === 'GET /api/list-users' && span.is_segment)!;
  const listUsersSpan = spans.find(span => span.name === 'auth.admin.listUsers');

  expectDbSpan(listUsersSpan, 'auth.admin.listUsers', {
    'db.operation.name': { value: 'auth.admin.listUsers', type: 'string' },
  });
  expect(listUsersSpan.is_segment).toBe(false);
  expect(listUsersSpan.trace_id).toBe(rootSpan.trace_id);
});
