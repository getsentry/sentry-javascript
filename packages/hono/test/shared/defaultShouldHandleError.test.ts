import { HTTPException } from 'hono/http-exception';
import { describe, expect, it } from 'vitest';
import { defaultShouldHandleError } from '../../src/shared/defaultShouldHandleError';

describe('defaultShouldHandleError', () => {
  describe('HTTPException', () => {
    it('returns false for 4xx HTTPException (skip)', () => {
      expect(defaultShouldHandleError(new HTTPException(400, { message: 'Bad Request' }))).toBe(false);
      expect(defaultShouldHandleError(new HTTPException(401, { message: 'Unauthorized' }))).toBe(false);
      expect(defaultShouldHandleError(new HTTPException(403, { message: 'Forbidden' }))).toBe(false);
      expect(defaultShouldHandleError(new HTTPException(404, { message: 'Not Found' }))).toBe(false);
      expect(defaultShouldHandleError(new HTTPException(422, { message: 'Unprocessable Entity' }))).toBe(false);
      expect(defaultShouldHandleError(new HTTPException(499))).toBe(false);
    });

    it('returns true for 5xx HTTPException (capture)', () => {
      expect(defaultShouldHandleError(new HTTPException(500, { message: 'Internal Server Error' }))).toBe(true);
      expect(defaultShouldHandleError(new HTTPException(502, { message: 'Bad Gateway' }))).toBe(true);
      expect(defaultShouldHandleError(new HTTPException(503, { message: 'Service Unavailable' }))).toBe(true);
    });
  });

  describe('custom error classes with status property', () => {
    it('returns false for custom Error subclass with 4xx status (skip)', () => {
      class AuthError extends Error {
        status = 401;
      }
      expect(defaultShouldHandleError(new AuthError('unauthorized'))).toBe(false);
    });

    it('returns true for custom Error subclass with 5xx status (capture)', () => {
      class DbError extends Error {
        status = 500;
      }
      expect(defaultShouldHandleError(new DbError('connection lost'))).toBe(true);
    });

    it('returns false for plain object with 4xx status (skip)', () => {
      expect(defaultShouldHandleError({ status: 404, message: 'Not Found' })).toBe(false);
      expect(defaultShouldHandleError({ status: 400 })).toBe(false);
    });

    it('returns true for plain object with 5xx status (capture)', () => {
      expect(defaultShouldHandleError({ status: 500, message: 'Internal Server Error' })).toBe(true);
    });
  });

  describe('non-HTTP errors', () => {
    it('returns true for plain Error without status (capture)', () => {
      expect(defaultShouldHandleError(new Error('something broke'))).toBe(true);
    });

    it('returns true for non-object values (capture)', () => {
      expect(defaultShouldHandleError('string error')).toBe(true);
      expect(defaultShouldHandleError(42)).toBe(true);
      expect(defaultShouldHandleError(null)).toBe(true);
      expect(defaultShouldHandleError(undefined)).toBe(true);
      expect(defaultShouldHandleError(true)).toBe(true);
    });

    it('returns true when status is not a number (capture)', () => {
      expect(defaultShouldHandleError({ status: '404' })).toBe(true);
      expect(defaultShouldHandleError({ status: null })).toBe(true);
      expect(defaultShouldHandleError({ status: undefined })).toBe(true);
    });

    it('returns false for 3xx status (skip)', () => {
      expect(defaultShouldHandleError({ status: 301 })).toBe(false);
      expect(defaultShouldHandleError({ status: 302 })).toBe(false);
      expect(defaultShouldHandleError({ status: 399 })).toBe(false);
    });

    it('returns true for 2xx status (capture)', () => {
      expect(defaultShouldHandleError({ status: 200 })).toBe(true);
      expect(defaultShouldHandleError({ status: 299 })).toBe(true);
    });
  });
});
