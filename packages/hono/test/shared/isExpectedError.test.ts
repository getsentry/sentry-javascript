import { HTTPException } from 'hono/http-exception';
import { describe, expect, it } from 'vitest';
import { isExpectedError } from '../../src/shared/isExpectedError';

describe('isExpectedError', () => {
  describe('HTTPException', () => {
    it('returns true for 4xx HTTPException', () => {
      expect(isExpectedError(new HTTPException(400, { message: 'Bad Request' }))).toBe(true);
      expect(isExpectedError(new HTTPException(401, { message: 'Unauthorized' }))).toBe(true);
      expect(isExpectedError(new HTTPException(403, { message: 'Forbidden' }))).toBe(true);
      expect(isExpectedError(new HTTPException(404, { message: 'Not Found' }))).toBe(true);
      expect(isExpectedError(new HTTPException(422, { message: 'Unprocessable Entity' }))).toBe(true);
      expect(isExpectedError(new HTTPException(499))).toBe(true);
    });

    it('returns false for 5xx HTTPException', () => {
      expect(isExpectedError(new HTTPException(500, { message: 'Internal Server Error' }))).toBe(false);
      expect(isExpectedError(new HTTPException(502, { message: 'Bad Gateway' }))).toBe(false);
      expect(isExpectedError(new HTTPException(503, { message: 'Service Unavailable' }))).toBe(false);
    });
  });

  describe('custom error classes with status property', () => {
    it('returns true for custom Error subclass with 4xx status', () => {
      class AuthError extends Error {
        status = 401;
      }
      expect(isExpectedError(new AuthError('unauthorized'))).toBe(true);
    });

    it('returns false for custom Error subclass with 5xx status', () => {
      class DbError extends Error {
        status = 500;
      }
      expect(isExpectedError(new DbError('connection lost'))).toBe(false);
    });

    it('returns true for plain object with 4xx status', () => {
      expect(isExpectedError({ status: 404, message: 'Not Found' })).toBe(true);
      expect(isExpectedError({ status: 400 })).toBe(true);
    });

    it('returns false for plain object with 5xx status', () => {
      expect(isExpectedError({ status: 500, message: 'Internal Server Error' })).toBe(false);
    });
  });

  describe('non-expected errors', () => {
    it('returns false for plain Error without status', () => {
      expect(isExpectedError(new Error('something broke'))).toBe(false);
    });

    it('returns false for non-object values', () => {
      expect(isExpectedError('string error')).toBe(false);
      expect(isExpectedError(42)).toBe(false);
      expect(isExpectedError(null)).toBe(false);
      expect(isExpectedError(undefined)).toBe(false);
      expect(isExpectedError(true)).toBe(false);
    });

    it('returns false when status is not a number', () => {
      expect(isExpectedError({ status: '404' })).toBe(false);
      expect(isExpectedError({ status: null })).toBe(false);
      expect(isExpectedError({ status: undefined })).toBe(false);
    });

    it('returns true for 3xx status', () => {
      expect(isExpectedError({ status: 301 })).toBe(true);
      expect(isExpectedError({ status: 302 })).toBe(true);
      expect(isExpectedError({ status: 399 })).toBe(true);
    });

    it('returns false for 2xx status', () => {
      expect(isExpectedError({ status: 200 })).toBe(false);
      expect(isExpectedError({ status: 299 })).toBe(false);
    });
  });
});
