import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as breadcrumbModule from '../../../src/breadcrumbs';
import * as exportsModule from '../../../src/exports';
import {
  extractOperation,
  instrumentSupabaseClient,
  translateFiltersIntoMethods,
} from '../../../src/integrations/supabase';
import type {
  PostgRESTQueryBuilder,
  SupabaseClientInstance,
} from '../../../src/integrations/supabase';

// Mock tracing to avoid needing full SDK setup
vi.mock('../../../src/tracing', () => ({
  startSpan: (_opts: any, cb: (span: any) => any) => {
    const mockSpan = {
      setStatus: vi.fn(),
      end: vi.fn(),
    };
    return cb(mockSpan);
  },
  setHttpStatus: vi.fn(),
  SPAN_STATUS_OK: 1,
  SPAN_STATUS_ERROR: 2,
}));

describe('Supabase Integration', () => {
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

    function createMockSupabaseClient(resolveWith: unknown): unknown {
      // Create a PostgRESTFilterBuilder-like class
      class MockPostgRESTFilterBuilder {
        method = 'GET';
        headers: Record<string, string> = { 'X-Client-Info': 'supabase-js/2.0.0' };
        url = new URL('https://example.supabase.co/rest/v1/todos');
        schema = 'public';
        body = undefined;

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

      // Create a mock SupabaseClient constructor
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
});
