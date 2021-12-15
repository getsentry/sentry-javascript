import { ExtendedError } from '@sentry/types';

import { BrowserBackend } from '../../../src/backend';
import * as LinkedErrorsModule from '../../../src/integrations/linkederrors';

describe('LinkedErrors', () => {
  describe('handler', () => {
    it('should bail out if event does not contain exception', () => {
      const event = {
        message: 'foo',
      };
      const result = LinkedErrorsModule._handler('cause', 5, event);
      expect(result).toEqual(event);
    });

    it('should bail out if event contains exception, but no hint', () => {
      const event = {
        exception: {
          values: [],
        },
        message: 'foo',
      };
      const result = LinkedErrorsModule._handler('cause', 5, event);
      expect(result).toEqual(event);
    });

    it('should recursively walk error to find linked exceptions and assign them to the event', async () => {
      const three: ExtendedError = new SyntaxError('three');

      const two: ExtendedError = new TypeError('two');
      two.cause = three;

      const one: ExtendedError = new Error('one');
      one.cause = two;

      const originalException = one;
      const backend = new BrowserBackend({});
      return backend.eventFromException(originalException).then(event => {
        const result = LinkedErrorsModule._handler('cause', 5, event, {
          originalException,
        });

        // It shouldn't include root exception, as it's already processed in the event by the main error handler
        expect(result.exception.values.length).toBe(3);
        expect(result.exception.values[0].type).toBe('SyntaxError');
        expect(result.exception.values[0].value).toBe('three');
        expect(result.exception.values[0].stacktrace).toHaveProperty('frames');
        expect(result.exception.values[1].type).toBe('TypeError');
        expect(result.exception.values[1].value).toBe('two');
        expect(result.exception.values[1].stacktrace).toHaveProperty('frames');
        expect(result.exception.values[2].type).toBe('Error');
        expect(result.exception.values[2].value).toBe('one');
        expect(result.exception.values[2].stacktrace).toHaveProperty('frames');
      });
    });

    it('should allow to change walk key', async () => {
      const three: ExtendedError = new SyntaxError('three');

      const two: ExtendedError = new TypeError('two');
      two.reason = three;

      const one: ExtendedError = new Error('one');
      one.reason = two;

      const originalException = one;
      const backend = new BrowserBackend({});
      return backend.eventFromException(originalException).then(event => {
        const result = LinkedErrorsModule._handler('reason', 5, event, {
          originalException,
        });

        expect(result.exception.values.length).toBe(3);
        expect(result.exception.values[0].type).toBe('SyntaxError');
        expect(result.exception.values[0].value).toBe('three');
        expect(result.exception.values[0].stacktrace).toHaveProperty('frames');
        expect(result.exception.values[1].type).toBe('TypeError');
        expect(result.exception.values[1].value).toBe('two');
        expect(result.exception.values[1].stacktrace).toHaveProperty('frames');
        expect(result.exception.values[2].type).toBe('Error');
        expect(result.exception.values[2].value).toBe('one');
        expect(result.exception.values[2].stacktrace).toHaveProperty('frames');
      });
    });

    it('should allow to change stack size limit', async () => {
      const one: ExtendedError = new Error('one');
      const two: ExtendedError = new TypeError('two');
      const three: ExtendedError = new SyntaxError('three');
      one.cause = two;
      two.cause = three;

      const backend = new BrowserBackend({});
      const originalException = one;
      return backend.eventFromException(originalException).then(event => {
        const result = LinkedErrorsModule._handler('cause', 2, event, {
          originalException,
        });

        expect(result.exception.values.length).toBe(2);
        expect(result.exception.values[0].type).toBe('TypeError');
        expect(result.exception.values[0].value).toBe('two');
        expect(result.exception.values[0].stacktrace).toHaveProperty('frames');
        expect(result.exception.values[1].type).toBe('Error');
        expect(result.exception.values[1].value).toBe('one');
        expect(result.exception.values[1].stacktrace).toHaveProperty('frames');
      });
    });
  });
});
