import { afterEach, describe, expect, it } from 'vitest';
import {
  getExternalPropagationContext,
  getTraceContextFromScope,
  hasExternalPropagationContext,
  registerExternalPropagationContext,
} from '../../src/currentScopes';
import { Scope } from '../../src/scope';

describe('External Propagation Context', () => {
  afterEach(() => {
    // Reset by registering a provider that returns undefined
    registerExternalPropagationContext(() => undefined);
  });

  describe('registerExternalPropagationContext', () => {
    it('registers a provider function', () => {
      registerExternalPropagationContext(() => ({
        traceId: 'abc123',
        spanId: 'def456',
      }));

      expect(hasExternalPropagationContext()).toBe(true);
    });
  });

  describe('getExternalPropagationContext', () => {
    it('returns undefined when provider returns undefined', () => {
      registerExternalPropagationContext(() => undefined);
      expect(getExternalPropagationContext()).toBeUndefined();
    });

    it('returns trace context from provider', () => {
      registerExternalPropagationContext(() => ({
        traceId: '12345678901234567890123456789012',
        spanId: '1234567890123456',
      }));

      const result = getExternalPropagationContext();
      expect(result).toEqual({
        traceId: '12345678901234567890123456789012',
        spanId: '1234567890123456',
      });
    });
  });

  describe('hasExternalPropagationContext', () => {
    it('returns true after registration', () => {
      registerExternalPropagationContext(() => undefined);
      expect(hasExternalPropagationContext()).toBe(true);
    });
  });

  describe('getTraceContextFromScope with external propagation context', () => {
    it('uses external propagation context when available', () => {
      registerExternalPropagationContext(() => ({
        traceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1',
        spanId: 'bbbbbbbbbbbbbb01',
      }));

      const scope = new Scope();
      scope.setPropagationContext({
        traceId: 'cccccccccccccccccccccccccccccc01',
        sampleRand: 0.5,
      });

      const traceContext = getTraceContextFromScope(scope);
      expect(traceContext.trace_id).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1');
      expect(traceContext.span_id).toBe('bbbbbbbbbbbbbb01');
      expect(traceContext.parent_span_id).toBeUndefined();
    });

    it('falls back to scope propagation context when provider returns undefined', () => {
      registerExternalPropagationContext(() => undefined);

      const scope = new Scope();
      scope.setPropagationContext({
        traceId: 'cccccccccccccccccccccccccccccc01',
        sampleRand: 0.5,
      });

      const traceContext = getTraceContextFromScope(scope);
      expect(traceContext.trace_id).toBe('cccccccccccccccccccccccccccccc01');
    });
  });
});
