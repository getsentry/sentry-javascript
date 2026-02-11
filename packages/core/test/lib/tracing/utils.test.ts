import { describe, expect, it, vi } from 'vitest';
import { Scope } from '../../../src/scope';
import { getCapturedScopesOnSpan, setCapturedScopesOnSpan } from '../../../src/tracing/utils';
import type { Span } from '../../../src/types-hoist/span';

// Mock span object that implements the minimum needed interface
function createMockSpan(): Span {
  return {} as Span;
}

describe('tracing utils', () => {
  describe('setCapturedScopesOnSpan / getCapturedScopesOnSpan', () => {
    it('stores and retrieves scopes correctly', () => {
      const span = createMockSpan();
      const scope = new Scope();
      const isolationScope = new Scope();

      scope.setTag('test-scope', 'value1');
      isolationScope.setTag('test-isolation-scope', 'value2');

      setCapturedScopesOnSpan(span, scope, isolationScope);
      const retrieved = getCapturedScopesOnSpan(span);

      expect(retrieved.scope).toBe(scope);
      expect(retrieved.isolationScope).toBe(isolationScope);
      expect(retrieved.scope?.getScopeData().tags).toEqual({ 'test-scope': 'value1' });
      expect(retrieved.isolationScope?.getScopeData().tags).toEqual({ 'test-isolation-scope': 'value2' });
    });

    it('handles undefined span gracefully in setCapturedScopesOnSpan', () => {
      const scope = new Scope();
      const isolationScope = new Scope();

      expect(() => {
        setCapturedScopesOnSpan(undefined, scope, isolationScope);
      }).not.toThrow();
    });

    it('returns undefined scopes when span has no captured scopes', () => {
      const span = createMockSpan();
      const retrieved = getCapturedScopesOnSpan(span);

      expect(retrieved.scope).toBeUndefined();
      expect(retrieved.isolationScope).toBeUndefined();
    });

    it('uses WeakRef only for isolation scopes', () => {
      const span = createMockSpan();
      const scope = new Scope();
      const isolationScope = new Scope();

      setCapturedScopesOnSpan(span, scope, isolationScope);

      // Check that only isolation scope is wrapped with WeakRef
      const spanWithScopes = span as any;
      expect(spanWithScopes._sentryScope).toBe(scope); // Regular scope stored directly
      expect(spanWithScopes._sentryIsolationScope).toBeInstanceOf(WeakRef); // Isolation scope wrapped

      // Verify we can still retrieve the scopes
      const retrieved = getCapturedScopesOnSpan(span);
      expect(retrieved.scope).toBe(scope);
      expect(retrieved.isolationScope).toBe(isolationScope);
    });

    it('falls back to direct storage when WeakRef is not available', () => {
      // Temporarily disable WeakRef
      const originalWeakRef = globalThis.WeakRef;

      (globalThis as any).WeakRef = undefined;

      try {
        const span = createMockSpan();
        const scope = new Scope();
        const isolationScope = new Scope();

        setCapturedScopesOnSpan(span, scope, isolationScope);

        // Check that both scopes are stored directly when WeakRef is not available
        const spanWithScopes = span as any;
        expect(spanWithScopes._sentryScope).toBe(scope); // Regular scope always stored directly
        expect(spanWithScopes._sentryIsolationScope).toBe(isolationScope); // Isolation scope falls back to direct storage

        // When WeakRef is available, ensure regular scope is not wrapped but isolation scope would be
        if (originalWeakRef) {
          expect(spanWithScopes._sentryScope).not.toBeInstanceOf(originalWeakRef);
          expect(spanWithScopes._sentryIsolationScope).not.toBeInstanceOf(originalWeakRef);
        }

        // Verify we can still retrieve the scopes
        const retrieved = getCapturedScopesOnSpan(span);
        expect(retrieved.scope).toBe(scope);
        expect(retrieved.isolationScope).toBe(isolationScope);
      } finally {
        // Restore WeakRef
        (globalThis as any).WeakRef = originalWeakRef;
      }
    });

    it('handles WeakRef deref returning undefined gracefully', () => {
      const span = createMockSpan();
      const scope = new Scope();
      const isolationScope = new Scope();

      setCapturedScopesOnSpan(span, scope, isolationScope);

      // Mock WeakRef.deref to return undefined for isolation scope (simulating garbage collection)
      // Regular scope is stored directly, so it should always be available
      const spanWithScopes = span as any;
      const mockIsolationScopeWeakRef = {
        deref: vi.fn().mockReturnValue(undefined),
      };

      // Keep the regular scope as is (stored directly)
      // Only replace the isolation scope with a mock WeakRef
      spanWithScopes._sentryIsolationScope = mockIsolationScopeWeakRef;

      const retrieved = getCapturedScopesOnSpan(span);
      expect(retrieved.scope).toBe(scope); // Regular scope should still be available
      expect(retrieved.isolationScope).toBeUndefined(); // Isolation scope should be undefined due to GC
      expect(mockIsolationScopeWeakRef.deref).toHaveBeenCalled();
    });

    it('handles corrupted WeakRef objects gracefully', () => {
      const span = createMockSpan();
      const scope = new Scope();

      // Set up a regular scope (stored directly) and a corrupted isolation scope WeakRef
      const spanWithScopes = span as any;
      spanWithScopes._sentryScope = scope; // Regular scope stored directly
      spanWithScopes._sentryIsolationScope = {
        deref: vi.fn().mockImplementation(() => {
          throw new Error('WeakRef deref failed');
        }),
      };

      const retrieved = getCapturedScopesOnSpan(span);
      expect(retrieved.scope).toBe(scope); // Regular scope should still be available
      expect(retrieved.isolationScope).toBeUndefined(); // Isolation scope should be undefined due to error
    });

    it('preserves scope data when using WeakRef', () => {
      const span = createMockSpan();
      const scope = new Scope();
      const isolationScope = new Scope();

      // Add various types of data to scopes
      scope.setTag('string-tag', 'value');
      scope.setTag('number-tag', 123);
      scope.setTag('boolean-tag', true);
      scope.setContext('test-context', { key: 'value' });
      scope.setUser({ id: 'test-user' });

      isolationScope.setExtra('extra-data', { complex: { nested: 'object' } });
      isolationScope.setLevel('warning');

      setCapturedScopesOnSpan(span, scope, isolationScope);
      const retrieved = getCapturedScopesOnSpan(span);

      // Verify all data is preserved
      expect(retrieved.scope?.getScopeData().tags).toEqual({
        'string-tag': 'value',
        'number-tag': 123,
        'boolean-tag': true,
      });
      expect(retrieved.scope?.getScopeData().contexts).toEqual({
        'test-context': { key: 'value' },
      });
      expect(retrieved.scope?.getScopeData().user).toEqual({ id: 'test-user' });

      expect(retrieved.isolationScope?.getScopeData().extra).toEqual({
        'extra-data': { complex: { nested: 'object' } },
      });
      expect(retrieved.isolationScope?.getScopeData().level).toBe('warning');
    });

    it('handles multiple spans with different scopes', () => {
      const span1 = createMockSpan();
      const span2 = createMockSpan();

      const scope1 = new Scope();
      const scope2 = new Scope();
      const isolationScope1 = new Scope();
      const isolationScope2 = new Scope();

      scope1.setTag('span', '1');
      scope2.setTag('span', '2');
      isolationScope1.setTag('isolation', '1');
      isolationScope2.setTag('isolation', '2');

      setCapturedScopesOnSpan(span1, scope1, isolationScope1);
      setCapturedScopesOnSpan(span2, scope2, isolationScope2);

      const retrieved1 = getCapturedScopesOnSpan(span1);
      const retrieved2 = getCapturedScopesOnSpan(span2);

      expect(retrieved1.scope?.getScopeData().tags).toEqual({ span: '1' });
      expect(retrieved1.isolationScope?.getScopeData().tags).toEqual({ isolation: '1' });

      expect(retrieved2.scope?.getScopeData().tags).toEqual({ span: '2' });
      expect(retrieved2.isolationScope?.getScopeData().tags).toEqual({ isolation: '2' });

      // Ensure they are different scope instances
      expect(retrieved1.scope).not.toBe(retrieved2.scope);
      expect(retrieved1.isolationScope).not.toBe(retrieved2.isolationScope);
    });

    it('handles span reuse correctly', () => {
      const span = createMockSpan();

      // First use
      const scope1 = new Scope();
      const isolationScope1 = new Scope();
      scope1.setTag('first', 'use');
      isolationScope1.setTag('first-isolation', 'use');

      setCapturedScopesOnSpan(span, scope1, isolationScope1);
      const retrieved1 = getCapturedScopesOnSpan(span);

      expect(retrieved1.scope?.getScopeData().tags).toEqual({ first: 'use' });
      expect(retrieved1.isolationScope?.getScopeData().tags).toEqual({ 'first-isolation': 'use' });

      // Reuse with different scopes (overwrite)
      const scope2 = new Scope();
      const isolationScope2 = new Scope();
      scope2.setTag('second', 'use');
      isolationScope2.setTag('second-isolation', 'use');

      setCapturedScopesOnSpan(span, scope2, isolationScope2);
      const retrieved2 = getCapturedScopesOnSpan(span);

      expect(retrieved2.scope?.getScopeData().tags).toEqual({ second: 'use' });
      expect(retrieved2.isolationScope?.getScopeData().tags).toEqual({ 'second-isolation': 'use' });

      // Should be the new scopes, not the old ones
      expect(retrieved2.scope).toBe(scope2);
      expect(retrieved2.isolationScope).toBe(isolationScope2);
    });
  });
});
