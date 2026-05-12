import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as breadcrumbModule from '../../../src/breadcrumbs';
import * as exportsModule from '../../../src/exports';
import {
  extractOperation,
  instrumentSupabaseClient,
  translateFiltersIntoMethods,
} from '../../../src/integrations/supabase';
import type { PostgRESTQueryBuilder, SupabaseClientInstance } from '../../../src/integrations/supabase';

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
  /** When set, configures the mocked Sentry client `sendDefaultPii`. Omit to leave `getClient` to the test file `beforeEach`. */
  sendDefaultPii?: boolean;
};

const DEFAULT_MOCK_SUPABASE_REST_URL = 'https://example.supabase.co/rest/v1/todos';

/** Shared PATCH + query string + body shape for `sendDefaultPii` tests. */
const MOCK_SUPABASE_PII_SCENARIO: Pick<CreateMockSupabaseClientOptions, 'method' | 'url' | 'body'> = {
  method: 'PATCH',
  url: 'https://example.supabase.co/rest/v1/users?email=eq.secret%40example.com&select=id',
  body: { full_name: 'Jane Doe', phone: '555-0100' },
};

function createMockSupabaseClient(resolveWith: unknown, options?: CreateMockSupabaseClientOptions): unknown {
  if (options?.sendDefaultPii !== undefined) {
    currentScopesMocks.getClient.mockReturnValue({
      getOptions: () => ({ sendDefaultPii: options.sendDefaultPii }),
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

  class MockPostgRESTFilterBuilder {
    method = method;
    headers: Record<string, string> = { 'X-Client-Info': 'supabase-js/2.0.0' };
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

  describe('sendDefaultPii', () => {
    let captureExceptionSpy: ReturnType<typeof vi.spyOn>;
    let addBreadcrumbSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      captureExceptionSpy = vi.spyOn(exportsModule, 'captureException').mockImplementation(() => '');
      addBreadcrumbSpy = vi.spyOn(breadcrumbModule, 'addBreadcrumb').mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('omits db.query, db.body, and breadcrumb query/body when sendDefaultPii is false', async () => {
      const client = createMockSupabaseClient(
        { status: 200 },
        { ...MOCK_SUPABASE_PII_SCENARIO, sendDefaultPii: false },
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

    it('includes db.query, db.body, and breadcrumb query/body when sendDefaultPii is true', async () => {
      const client = createMockSupabaseClient({ status: 200 }, { ...MOCK_SUPABASE_PII_SCENARIO, sendDefaultPii: true });
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

    it('omits supabase error context query/body when sendDefaultPii is false', async () => {
      const client = createMockSupabaseClient(
        { status: 400, error: { message: 'Bad request', code: '400' } },
        { ...MOCK_SUPABASE_PII_SCENARIO, sendDefaultPii: false },
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
          sendDefaultPii: true,
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
});
