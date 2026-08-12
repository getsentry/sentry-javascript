import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as breadcrumbModule from '../../../src/breadcrumbs';
import * as exportsModule from '../../../src/exports';
import {
  extractOperation,
  getHeader,
  instrumentSupabaseClient,
  translateFiltersIntoMethods,
} from '../../../src/integrations/supabase';
import type {
  PostgRESTHeaders,
  PostgRESTQueryBuilder,
  SupabaseClientInstance,
} from '../../../src/integrations/supabase';
import { resolveDataCollectionOptions } from '../../../src/utils/data-collection/resolveDataCollectionOptions';

const tracingMocks = vi.hoisted(() => ({
  startSpan: vi.fn((_opts: unknown, cb: (span: unknown) => unknown) => {
    const mockSpan = {
      setStatus: vi.fn(),
      end: vi.fn(),
    };
    return cb(mockSpan);
  }),
}));

const currentScopesMocks = vi.hoisted(() => ({
  getClient: vi.fn(),
}));

// Mock tracing to avoid needing full SDK setup
vi.mock('../../../src/tracing', () => ({
  startSpan: tracingMocks.startSpan,
  setHttpStatus: vi.fn(),
  SPAN_STATUS_OK: 1,
  SPAN_STATUS_ERROR: 2,
}));

vi.mock('../../../src/currentScopes', () => ({
  getClient: currentScopesMocks.getClient,
}));

type CreateMockSupabaseClientOptions = {
  method?: string;
  url?: URL | string;
  body?: unknown;
  /** Defaults to the plain-object shape used by `postgrest-js` v1. Pass a `Headers` instance to emulate v2. */
  headers?: PostgRESTHeaders;
  /** When set, configures the mocked Sentry client's `dataCollection.databaseQueryData`. Omit to leave `getClient` to the test file `beforeEach`. */
  dataCollectionDatabaseQueryData?: boolean;
};

const DEFAULT_MOCK_SUPABASE_REST_URL = 'https://example.supabase.co/rest/v1/todos';

/** Shared PATCH + query string + body shape for operation data tests. */
const MOCK_SUPABASE_PII_SCENARIO: Pick<CreateMockSupabaseClientOptions, 'method' | 'url' | 'body'> = {
  method: 'PATCH',
  url: 'https://example.supabase.co/rest/v1/users?email=eq.secret%40example.com&select=id',
  body: { full_name: 'Jane Doe', phone: '555-0100' },
};

function createMockSupabaseClient(resolveWith: unknown, options?: CreateMockSupabaseClientOptions): unknown {
  if (options?.dataCollectionDatabaseQueryData !== undefined) {
    currentScopesMocks.getClient.mockReturnValue({
      getDataCollectionOptions: () => ({ databaseQueryData: options.dataCollectionDatabaseQueryData }),
    } as any);
  }

  const method = options?.method ?? 'GET';
  const requestUrl =
    options?.url !== undefined
      ? options.url instanceof URL
        ? options.url
        : new URL(options.url)
      : new URL(DEFAULT_MOCK_SUPABASE_REST_URL);
  const body = options?.body;
  const headers = options?.headers ?? { 'X-Client-Info': 'supabase-js/2.0.0' };

  class MockPostgRESTFilterBuilder {
    method = method;
    headers: PostgRESTHeaders = headers;
    url = requestUrl;
    schema = 'public';
    body = body;

    then(onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any): Promise<any> {
      return Promise.resolve(resolveWith).then(onfulfilled, onrejected);
    }
  }

  class MockPostgRESTQueryBuilder {
    select() {
      return new MockPostgRESTFilterBuilder();
    }
    insert() {
      return new MockPostgRESTFilterBuilder();
    }
    upsert() {
      return new MockPostgRESTFilterBuilder();
    }
    update() {
      return new MockPostgRESTFilterBuilder();
    }
    delete() {
      return new MockPostgRESTFilterBuilder();
    }
  }

  class MockSupabaseClient {
    auth = {
      admin: {} as any,
    } as SupabaseClientInstance['auth'];

    from(_table: string): PostgRESTQueryBuilder {
      return new MockPostgRESTQueryBuilder() as unknown as PostgRESTQueryBuilder;
    }
  }

  return new MockSupabaseClient();
}

describe('Supabase Integration', () => {
  beforeEach(() => {
    currentScopesMocks.getClient.mockReturnValue(undefined);
  });

  describe('getHeader', () => {
    it('reads a header off a plain object', () => {
      expect(getHeader({ 'X-Client-Info': 'supabase-js/2.0.0' }, 'X-Client-Info')).toBe('supabase-js/2.0.0');
    });

    it('reads a header off a Headers instance', () => {
      expect(getHeader(new Headers({ 'X-Client-Info': 'supabase-js/2.112.0' }), 'X-Client-Info')).toBe(
        'supabase-js/2.112.0',
      );
    });

    it('looks up plain object headers case-insensitively', () => {
      expect(getHeader({ prefer: 'resolution=merge-duplicates' }, 'Prefer')).toBe('resolution=merge-duplicates');
    });

    it('returns undefined for unset headers', () => {
      expect(getHeader({ Prefer: 'count=exact' }, 'X-Client-Info')).toBeUndefined();
      expect(getHeader(new Headers({ Prefer: 'count=exact' }), 'X-Client-Info')).toBeUndefined();
      expect(getHeader(undefined, 'X-Client-Info')).toBeUndefined();
    });
  });

  describe('extractOperation', () => {
    it('returns select for GET', () => {
      expect(extractOperation('GET')).toBe('select');
    });

    it('returns insert for POST without resolution header', () => {
      expect(extractOperation('POST')).toBe('insert');
    });

    it('returns upsert for POST with resolution header', () => {
      expect(extractOperation('POST', { Prefer: 'resolution=merge-duplicates' })).toBe('upsert');
    });

    it('returns upsert for POST with resolution header on a Headers instance', () => {
      expect(extractOperation('POST', new Headers({ Prefer: 'resolution=merge-duplicates' }))).toBe('upsert');
    });

    it('returns update for PATCH', () => {
      expect(extractOperation('PATCH')).toBe('update');
    });

    it('returns delete for DELETE', () => {
      expect(extractOperation('DELETE')).toBe('delete');
    });
  });

  describe('translateFiltersIntoMethods', () => {
    it('returns select(*) for wildcard', () => {
      expect(translateFiltersIntoMethods('select', '*')).toBe('select(*)');
    });

    it('returns select with columns', () => {
      expect(translateFiltersIntoMethods('select', 'id,name')).toBe('select(id,name)');
    });

    it('translates eq filter', () => {
      expect(translateFiltersIntoMethods('id', 'eq.123')).toBe('eq(id, 123)');
    });
  });

  describe('instrumentPostgRESTFilterBuilder - nullish response handling', () => {
    let captureExceptionSpy: ReturnType<typeof vi.spyOn>;
    let addBreadcrumbSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      captureExceptionSpy = vi.spyOn(exportsModule, 'captureException').mockImplementation(() => '');
      addBreadcrumbSpy = vi.spyOn(breadcrumbModule, 'addBreadcrumb').mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('handles undefined response without throwing', async () => {
      const client = createMockSupabaseClient(undefined);
      instrumentSupabaseClient(client);

      const builder = (client as any).from('todos');
      const result = builder.select('*');

      // This should not throw even though the response is undefined
      const res = await result;
      expect(res).toBeUndefined();
    });

    it('handles null response without throwing', async () => {
      const client = createMockSupabaseClient(null);
      instrumentSupabaseClient(client);

      const builder = (client as any).from('todos');
      const result = builder.select('*');

      const res = await result;
      expect(res).toBeNull();
    });

    it('still adds breadcrumb when response is undefined', async () => {
      const client = createMockSupabaseClient(undefined);
      instrumentSupabaseClient(client);

      const builder = (client as any).from('todos');
      await builder.select('*');

      expect(addBreadcrumbSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'supabase',
          category: 'db.select',
        }),
      );
    });

    it('does not capture exception when response is undefined', async () => {
      const client = createMockSupabaseClient(undefined);
      instrumentSupabaseClient(client);

      const builder = (client as any).from('todos');
      await builder.select('*');

      expect(captureExceptionSpy).not.toHaveBeenCalled();
    });

    it('still captures error when response has error', async () => {
      const client = createMockSupabaseClient({ status: 400, error: { message: 'Bad request', code: '400' } });
      instrumentSupabaseClient(client);

      const builder = (client as any).from('todos');
      await builder.select('*');

      expect(captureExceptionSpy).toHaveBeenCalled();
    });
  });

  describe('operation data collection', () => {
    let captureExceptionSpy: ReturnType<typeof vi.spyOn>;
    let addBreadcrumbSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      captureExceptionSpy = vi.spyOn(exportsModule, 'captureException').mockImplementation(() => '');
      addBreadcrumbSpy = vi.spyOn(breadcrumbModule, 'addBreadcrumb').mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('omits db.query, db.body, and breadcrumb query/body when dataCollection.databaseQueryData is false', async () => {
      const client = createMockSupabaseClient(
        { status: 200 },
        { ...MOCK_SUPABASE_PII_SCENARIO, dataCollectionDatabaseQueryData: false },
      );
      instrumentSupabaseClient(client);

      await (client as any).from('users').update({}).then();

      const spanOptions = tracingMocks.startSpan.mock.calls[0]![0] as {
        name: string;
        attributes: Record<string, unknown>;
      };
      expect(spanOptions.name).toContain('[redacted]');
      expect(spanOptions.name).not.toContain('secret');
      expect(spanOptions.attributes['db.query']).toBeUndefined();
      expect(spanOptions.attributes['db.body']).toBeUndefined();

      const breadcrumb = addBreadcrumbSpy.mock.calls[0]![0] as { data?: unknown };
      expect(breadcrumb).not.toHaveProperty('data');
    });

    it('includes db.query, db.body, and breadcrumb query/body when dataCollection.databaseQueryData is true', async () => {
      const client = createMockSupabaseClient(
        { status: 200 },
        { ...MOCK_SUPABASE_PII_SCENARIO, dataCollectionDatabaseQueryData: true },
      );
      instrumentSupabaseClient(client);

      await (client as any).from('users').update({}).then();

      const spanOptions = tracingMocks.startSpan.mock.calls[0]![0] as {
        name: string;
        attributes: Record<string, unknown>;
      };
      expect(spanOptions.name).toContain('eq(email, secret@example.com)');
      expect(spanOptions.attributes['db.query']).toEqual(
        expect.arrayContaining([expect.stringContaining('secret@example.com')]),
      );
      expect(spanOptions.attributes['db.body']).toEqual(
        expect.objectContaining({ full_name: 'Jane Doe', phone: '555-0100' }),
      );

      expect(addBreadcrumbSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            query: expect.any(Array),
            body: expect.objectContaining({ full_name: 'Jane Doe' }),
          }),
        }),
      );
    });

    it('includes data when sendOperationData option is set, regardless of dataCollection.databaseQueryData', async () => {
      const client = createMockSupabaseClient(
        { status: 200 },
        { ...MOCK_SUPABASE_PII_SCENARIO, dataCollectionDatabaseQueryData: false },
      );
      instrumentSupabaseClient(client, { sendOperationData: true });

      await (client as any).from('users').update({}).then();

      const spanOptions = tracingMocks.startSpan.mock.calls[0]![0] as {
        name: string;
        attributes: Record<string, unknown>;
      };
      expect(spanOptions.name).toContain('eq(email, secret@example.com)');
      expect(spanOptions.attributes['db.query']).toEqual(
        expect.arrayContaining([expect.stringContaining('secret@example.com')]),
      );
      expect(spanOptions.attributes['db.body']).toEqual(
        expect.objectContaining({ full_name: 'Jane Doe', phone: '555-0100' }),
      );
    });

    it('sendOperationData: false takes precedence over dataCollection.databaseQueryData: true', async () => {
      const client = createMockSupabaseClient(
        { status: 200 },
        { ...MOCK_SUPABASE_PII_SCENARIO, dataCollectionDatabaseQueryData: true },
      );
      instrumentSupabaseClient(client, { sendOperationData: false });

      await (client as any).from('users').update({}).then();

      const spanOptions = tracingMocks.startSpan.mock.calls[0]![0] as {
        name: string;
        attributes: Record<string, unknown>;
      };
      expect(spanOptions.name).toContain('[redacted]');
      expect(spanOptions.attributes['db.query']).toBeUndefined();
      expect(spanOptions.attributes['db.body']).toBeUndefined();
    });

    it('includes data when legacy sendDefaultPii: true is bridged to dataCollection.databaseQueryData', async () => {
      const resolved = resolveDataCollectionOptions({ sendDefaultPii: true });
      currentScopesMocks.getClient.mockReturnValue({
        getDataCollectionOptions: () => resolved,
      } as any);

      const client = createMockSupabaseClient({ status: 200 }, { ...MOCK_SUPABASE_PII_SCENARIO });
      instrumentSupabaseClient(client);

      await (client as any).from('users').update({}).then();

      const spanOptions = tracingMocks.startSpan.mock.calls[0]![0] as {
        name: string;
        attributes: Record<string, unknown>;
      };
      expect(spanOptions.name).toContain('eq(email, secret@example.com)');
      expect(spanOptions.attributes['db.query']).toEqual(
        expect.arrayContaining([expect.stringContaining('secret@example.com')]),
      );
      expect(spanOptions.attributes['db.body']).toEqual(
        expect.objectContaining({ full_name: 'Jane Doe', phone: '555-0100' }),
      );
    });

    it('redacts data when legacy sendDefaultPii is not set (bridged defaults)', async () => {
      const resolved = resolveDataCollectionOptions({ sendDefaultPii: false });
      currentScopesMocks.getClient.mockReturnValue({
        getDataCollectionOptions: () => resolved,
      } as any);

      const client = createMockSupabaseClient({ status: 200 }, { ...MOCK_SUPABASE_PII_SCENARIO });
      instrumentSupabaseClient(client);

      await (client as any).from('users').update({}).then();

      const spanOptions = tracingMocks.startSpan.mock.calls[0]![0] as {
        name: string;
        attributes: Record<string, unknown>;
      };
      expect(spanOptions.name).toContain('[redacted]');
      expect(spanOptions.name).not.toContain('secret');
      expect(spanOptions.attributes['db.query']).toBeUndefined();
      expect(spanOptions.attributes['db.body']).toBeUndefined();
    });

    it('omits supabase error context query/body when data collection is off', async () => {
      const client = createMockSupabaseClient(
        { status: 400, error: { message: 'Bad request', code: '400' } },
        { ...MOCK_SUPABASE_PII_SCENARIO, dataCollectionDatabaseQueryData: false },
      );
      instrumentSupabaseClient(client);

      await (client as any).from('users').update({}).then();

      expect(captureExceptionSpy).toHaveBeenCalled();
      const scopeCallback = captureExceptionSpy.mock.calls[0]![1] as (scope: {
        addEventProcessor: (fn: (e: unknown) => unknown) => void;
        setContext: (key: string, ctx: Record<string, unknown>) => void;
      }) => unknown;
      const contexts: Record<string, Record<string, unknown>> = {};
      scopeCallback({
        addEventProcessor: () => {},
        setContext(key: string, ctx: Record<string, unknown>) {
          contexts[key] = ctx;
        },
      } as any);
      expect(contexts.supabase).toEqual({});
    });
  });

  describe('array insert body', () => {
    beforeEach(() => {
      vi.spyOn(breadcrumbModule, 'addBreadcrumb').mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('includes insert(...) in span description and db.body when payload is a non-empty array', async () => {
      tracingMocks.startSpan.mockClear();
      const client = createMockSupabaseClient(
        { status: 200 },
        {
          method: 'POST',
          url: 'https://example.supabase.co/rest/v1/todos?columns=',
          body: [{ title: 'Test Todo' }],
          dataCollectionDatabaseQueryData: true,
        },
      );
      instrumentSupabaseClient(client);

      await (client as any).from('todos').insert({}).then();

      const spanOptions = tracingMocks.startSpan.mock.calls[0]![0] as {
        name: string;
        attributes: Record<string, unknown>;
      };
      expect(spanOptions.name).toMatch(/^insert\(\.\.\.\)/);
      expect(spanOptions.name).toContain('from(todos)');
      expect(spanOptions.attributes['db.body']).toEqual([{ title: 'Test Todo' }]);
    });
  });

  describe.each([
    ['plain object headers', (init: Record<string, string>): PostgRESTHeaders => init],
    ['Headers instance', (init: Record<string, string>): PostgRESTHeaders => new Headers(init)],
  ])('%s', (_name, createHeaders) => {
    beforeEach(() => {
      vi.spyOn(breadcrumbModule, 'addBreadcrumb').mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('sets db.sdk from X-Client-Info', async () => {
      tracingMocks.startSpan.mockClear();
      const client = createMockSupabaseClient(
        { status: 200 },
        { headers: createHeaders({ 'X-Client-Info': 'supabase-js/2.112.0' }) },
      );
      instrumentSupabaseClient(client);

      await (client as any).from('todos').select().then();

      const spanOptions = tracingMocks.startSpan.mock.calls[0]![0] as { attributes: Record<string, unknown> };
      expect(spanOptions.attributes['db.sdk']).toBe('supabase-js/2.112.0');
    });

    it('detects upsert from the Prefer header', async () => {
      tracingMocks.startSpan.mockClear();
      const client = createMockSupabaseClient(
        { status: 200 },
        {
          method: 'POST',
          body: { title: 'Test Todo' },
          headers: createHeaders({ Prefer: 'resolution=merge-duplicates' }),
        },
      );
      instrumentSupabaseClient(client);

      await (client as any).from('todos').upsert({}).then();

      const spanOptions = tracingMocks.startSpan.mock.calls[0]![0] as {
        name: string;
        attributes: Record<string, unknown>;
      };
      expect(spanOptions.name).toMatch(/^upsert\(\.\.\.\)/);
      expect(spanOptions.attributes['db.operation']).toBe('upsert');
    });
  });
});
