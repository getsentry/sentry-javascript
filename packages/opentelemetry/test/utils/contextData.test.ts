import { ROOT_CONTEXT } from '@opentelemetry/api';
import { Scope } from '@sentry/core';
import { describe, expect, it } from 'vitest';
import {
  getContextFromScope,
  getScopesFromContext,
  setContextOnScope,
  setScopesOnContext,
} from '../../src/utils/contextData';
import type { CurrentScopes } from '../../src/types';

describe('contextData', () => {
  describe('getScopesFromContext / setScopesOnContext', () => {
    it('returns undefined when no scopes are set on context', () => {
      const context = ROOT_CONTEXT;
      expect(getScopesFromContext(context)).toBeUndefined();
    });

    it('returns scopes that were set on context', () => {
      const scope = new Scope();
      const isolationScope = new Scope();
      const scopes: CurrentScopes = { scope, isolationScope };

      const contextWithScopes = setScopesOnContext(ROOT_CONTEXT, scopes);

      expect(getScopesFromContext(contextWithScopes)).toBe(scopes);
      expect(getScopesFromContext(contextWithScopes)?.scope).toBe(scope);
      expect(getScopesFromContext(contextWithScopes)?.isolationScope).toBe(isolationScope);
    });

    it('does not modify the original context', () => {
      const scope = new Scope();
      const isolationScope = new Scope();
      const scopes: CurrentScopes = { scope, isolationScope };

      const originalContext = ROOT_CONTEXT;
      const newContext = setScopesOnContext(originalContext, scopes);

      expect(getScopesFromContext(originalContext)).toBeUndefined();
      expect(getScopesFromContext(newContext)).toBe(scopes);
    });

    it('allows overwriting scopes on a derived context', () => {
      const scope1 = new Scope();
      const isolationScope1 = new Scope();
      const scopes1: CurrentScopes = { scope: scope1, isolationScope: isolationScope1 };

      const scope2 = new Scope();
      const isolationScope2 = new Scope();
      const scopes2: CurrentScopes = { scope: scope2, isolationScope: isolationScope2 };

      const context1 = setScopesOnContext(ROOT_CONTEXT, scopes1);
      const context2 = setScopesOnContext(context1, scopes2);

      expect(getScopesFromContext(context1)).toBe(scopes1);
      expect(getScopesFromContext(context2)).toBe(scopes2);
    });
  });

  describe('setContextOnScope / getContextFromScope', () => {
    it('returns undefined when no context is set on scope', () => {
      const scope = new Scope();
      expect(getContextFromScope(scope)).toBeUndefined();
    });

    it('returns context that was set on scope', () => {
      const scope = new Scope();
      const context = ROOT_CONTEXT;

      setContextOnScope(scope, context);

      expect(getContextFromScope(scope)).toBe(context);
    });

    it('stores context as non-enumerable property', () => {
      const scope = new Scope();
      const context = ROOT_CONTEXT;

      setContextOnScope(scope, context);

      // The _scopeContext property should not appear in Object.keys
      expect(Object.keys(scope)).not.toContain('_scopeContext');

      // But the context should still be retrievable
      expect(getContextFromScope(scope)).toBe(context);
    });

    it('allows overwriting context on scope', () => {
      const scope = new Scope();
      const context1 = ROOT_CONTEXT;
      const scopes: CurrentScopes = { scope: new Scope(), isolationScope: new Scope() };
      const context2 = setScopesOnContext(ROOT_CONTEXT, scopes);

      setContextOnScope(scope, context1);
      expect(getContextFromScope(scope)).toBe(context1);

      setContextOnScope(scope, context2);
      expect(getContextFromScope(scope)).toBe(context2);
    });

    describe('WeakRef behavior', () => {
      it('uses WeakRef when available', () => {
        const scope = new Scope();
        const context = ROOT_CONTEXT;

        setContextOnScope(scope, context);

        // Access the internal property to verify WeakRef is used
        const scopeWithContext = scope as unknown as { _scopeContext?: unknown };
        const storedRef = scopeWithContext._scopeContext;

        // If WeakRef is available, the stored value should have a deref method
        if (typeof WeakRef !== 'undefined') {
          expect(storedRef).toBeDefined();
          expect(typeof (storedRef as { deref?: unknown }).deref).toBe('function');
        }
      });

      it('returns undefined when WeakRef has been garbage collected', () => {
        const scope = new Scope();

        // Simulate a garbage collected WeakRef by directly setting a mock
        const mockWeakRef = {
          deref: () => undefined,
        };
        (scope as unknown as { _scopeContext: unknown })._scopeContext = mockWeakRef;

        expect(getContextFromScope(scope)).toBeUndefined();
      });

      it('handles WeakRef.deref throwing an error', () => {
        const scope = new Scope();

        // Simulate a WeakRef that throws on deref
        const mockWeakRef = {
          deref: () => {
            throw new Error('deref failed');
          },
        };
        (scope as unknown as { _scopeContext: unknown })._scopeContext = mockWeakRef;

        expect(getContextFromScope(scope)).toBeUndefined();
      });

      it('works with direct reference fallback when WeakRef is not available', () => {
        const scope = new Scope();
        const context = ROOT_CONTEXT;

        // Simulate environment without WeakRef by directly setting a non-WeakRef value
        (scope as unknown as { _scopeContext: unknown })._scopeContext = context;

        expect(getContextFromScope(scope)).toBe(context);
      });
    });
  });

  describe('bidirectional relationship', () => {
    it('allows navigating from context to scope and back to context', () => {
      const scope = new Scope();
      const isolationScope = new Scope();
      const scopes: CurrentScopes = { scope, isolationScope };

      // Set up bidirectional relationship
      const contextWithScopes = setScopesOnContext(ROOT_CONTEXT, scopes);
      setContextOnScope(scope, contextWithScopes);

      // Navigate: context -> scopes -> scope -> context
      const retrievedScopes = getScopesFromContext(contextWithScopes);
      expect(retrievedScopes).toBe(scopes);

      const retrievedContext = getContextFromScope(retrievedScopes!.scope);
      expect(retrievedContext).toBe(contextWithScopes);
    });
  });
});
