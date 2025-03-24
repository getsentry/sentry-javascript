import { describe, it, expect, beforeEach } from 'vitest';
import { setCapturedScopesOnSpan, getCapturedScopesOnSpan } from '../../../src/tracing/utils';
import type { Scope } from '../../../src/scope';
import type { Span } from '../../../src/types-hoist';

describe('tracing utils', () => {
  let mockSpan: Span;
  let mockScope: Scope;
  let mockIsolationScope: Scope;

  beforeEach(() => {
    mockSpan = {} as Span;
    mockScope = {} as Scope;
    mockIsolationScope = {} as Scope;
  });

  describe('setCapturedScopesOnSpan', () => {
    it('should store scope and isolation scope on span', () => {
      setCapturedScopesOnSpan(mockSpan, mockScope, mockIsolationScope);
      const captured = getCapturedScopesOnSpan(mockSpan);
      expect(captured.scope).toBe(mockScope);
      expect(captured.isolationScope).toBe(mockIsolationScope);
    });

    it('should handle undefined span', () => {
      // Should not throw
      setCapturedScopesOnSpan(undefined, mockScope, mockIsolationScope);
    });
  });

  describe('getCapturedScopesOnSpan', () => {
    it('should return undefined scopes when no scopes were set', () => {
      const captured = getCapturedScopesOnSpan(mockSpan);
      expect(captured.scope).toBeUndefined();
      expect(captured.isolationScope).toBeUndefined();
    });

    it('should return stored scopes', () => {
      setCapturedScopesOnSpan(mockSpan, mockScope, mockIsolationScope);
      const captured = getCapturedScopesOnSpan(mockSpan);
      expect(captured.scope).toBe(mockScope);
      expect(captured.isolationScope).toBe(mockIsolationScope);
    });
  });
});
