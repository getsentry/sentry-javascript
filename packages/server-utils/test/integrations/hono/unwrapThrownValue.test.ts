import { describe, expect, it } from 'vitest';
import { unwrapThrownValue } from '../../../src/integrations/hono/unwrapThrownValue';

// A copy of the wrapper that Hono 5 makes for a thrown non-Error.
const toError = (err: unknown): Error =>
  err instanceof Error ? err : new Error(typeof err === 'string' ? err : undefined, { cause: err });

describe('unwrapThrownValue', () => {
  describe('unwraps the Hono 5 non-Error wrapper', () => {
    it('returns a thrown string', () => {
      expect(unwrapThrownValue(toError('Payment provider timed out'))).toBe('Payment provider timed out');
    });

    it('returns a thrown plain object', () => {
      const thrown = { code: 'ECONNRESET', retryable: true };

      expect(unwrapThrownValue(toError(thrown))).toBe(thrown);
    });

    it.each([{ thrown: undefined }, { thrown: null }, { thrown: 0 }, { thrown: false }, { thrown: '' }])(
      'returns a thrown falsy value $thrown',
      ({ thrown }) => {
        expect(unwrapThrownValue(toError(thrown))).toBe(thrown);
      },
    );
  });

  describe('does not unwrap other errors', () => {
    it('returns an Error with no cause', () => {
      const error = new Error('Payment provider timed out');

      expect(unwrapThrownValue(error)).toBe(error);
    });

    it('returns an Error with no message and no cause', () => {
      const error = new Error();

      expect(unwrapThrownValue(error)).toBe(error);
    });

    it.each([
      { message: 'Checkout failed', error: new Error('Checkout failed', { cause: new Error('Card declined') }) },
      { message: 'no', error: new Error(undefined, { cause: new Error('Card declined') }) },
    ])('returns an Error whose cause is an Error ($message message)', ({ error }) => {
      expect(unwrapThrownValue(error)).toBe(error);
    });

    it('returns an Error subclass with a non-Error cause', () => {
      class CheckoutError extends Error {}
      const error = new CheckoutError('', { cause: { code: 'ECONNRESET' } });

      expect(unwrapThrownValue(error)).toBe(error);
    });

    it.each([
      { cause: 'a string', error: new Error('Checkout failed', { cause: 'Card declined' }) },
      { cause: 'an object', error: new Error('Checkout failed', { cause: { code: 'ECONNRESET' } }) },
    ])('returns an Error whose message does not match its cause ($cause)', ({ error }) => {
      expect(unwrapThrownValue(error)).toBe(error);
    });

    it('returns a value that is not an Error', () => {
      expect(unwrapThrownValue('Payment provider timed out')).toBe('Payment provider timed out');
    });
  });
});
