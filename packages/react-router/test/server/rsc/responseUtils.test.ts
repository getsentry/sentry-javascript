import { addNonEnumerableProperty } from '@sentry/core';
import { describe, expect, it } from 'vitest';
import { isAlreadyCaptured, isNotFoundResponse, isRedirectResponse } from '../../../src/server/rsc/responseUtils';

describe('responseUtils', () => {
  describe('isAlreadyCaptured', () => {
    it('should return false for errors without __sentry_captured__', () => {
      expect(isAlreadyCaptured(new Error('test'))).toBe(false);
    });

    it('should return true for errors with __sentry_captured__ set', () => {
      const error = new Error('test');
      addNonEnumerableProperty(error as unknown as Record<string, unknown>, '__sentry_captured__', true);
      expect(isAlreadyCaptured(error)).toBe(true);
    });

    it('should return false for non-object values', () => {
      expect(isAlreadyCaptured(null)).toBe(false);
      expect(isAlreadyCaptured(undefined)).toBe(false);
      expect(isAlreadyCaptured('string')).toBe(false);
      expect(isAlreadyCaptured(42)).toBe(false);
    });
  });

  describe('isRedirectResponse', () => {
    it.each([301, 302, 303, 307, 308])('should return true for Response with %d status', status => {
      expect(isRedirectResponse(new Response(null, { status }))).toBe(true);
    });

    it.each([200, 404, 500])('should return false for Response with %d status', status => {
      expect(isRedirectResponse(new Response(null, { status }))).toBe(false);
    });

    it('should return true for object with redirect type', () => {
      expect(isRedirectResponse({ type: 'redirect', url: '/new-path' })).toBe(true);
    });

    it('should return true for object with status in 3xx range', () => {
      expect(isRedirectResponse({ status: 302, location: '/new-path' })).toBe(true);
    });

    it('should return false for non-object values', () => {
      expect(isRedirectResponse(null)).toBe(false);
      expect(isRedirectResponse(undefined)).toBe(false);
      expect(isRedirectResponse('error')).toBe(false);
      expect(isRedirectResponse(42)).toBe(false);
    });

    it('should return false for Error objects', () => {
      expect(isRedirectResponse(new Error('test'))).toBe(false);
    });
  });

  describe('isNotFoundResponse', () => {
    it('should return true for Response with 404 status', () => {
      expect(isNotFoundResponse(new Response(null, { status: 404 }))).toBe(true);
    });

    it.each([200, 302, 500])('should return false for Response with %d status', status => {
      expect(isNotFoundResponse(new Response(null, { status }))).toBe(false);
    });

    it('should return true for object with not-found or notFound type', () => {
      expect(isNotFoundResponse({ type: 'not-found' })).toBe(true);
      expect(isNotFoundResponse({ type: 'notFound' })).toBe(true);
    });

    it('should return true for object with status 404', () => {
      expect(isNotFoundResponse({ status: 404 })).toBe(true);
    });

    it('should return false for non-object values', () => {
      expect(isNotFoundResponse(null)).toBe(false);
      expect(isNotFoundResponse(undefined)).toBe(false);
      expect(isNotFoundResponse('error')).toBe(false);
      expect(isNotFoundResponse(42)).toBe(false);
    });
  });
});
