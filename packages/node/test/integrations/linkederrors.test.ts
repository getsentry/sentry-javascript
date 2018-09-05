import { LinkedErrors } from '../../src/integrations/linkederrors';

let linkedErrors: LinkedErrors;

interface ExtendedError extends Error {
  [key: string]: any;
}

describe('LinkedErrors', () => {
  beforeEach(() => {
    linkedErrors = new LinkedErrors();
  });

  describe('handler', () => {
    it('should bail out if event doesnt contain exception', async () => {
      const spy = jest.spyOn(linkedErrors, 'walkErrorTree');
      const event = {
        message: 'foo',
      };
      const result = await linkedErrors.handler(event);
      expect(spy.mock.calls.length).toEqual(0);
      expect(result).toEqual(event);
    });

    it('should bail out if event contains exception, but no hint', async () => {
      const spy = jest.spyOn(linkedErrors, 'walkErrorTree');
      const event = {
        exception: {
          values: [],
        },
        message: 'foo',
      };
      const result = await linkedErrors.handler(event);
      expect(spy.mock.calls.length).toEqual(0);
      expect(result).toEqual(event);
    });

    it('should call walkErrorTree if event contains exception and hint with originalException', async () => {
      const spy = jest.spyOn(linkedErrors, 'walkErrorTree').mockImplementation(
        async () =>
          new Promise<[]>(resolve => {
            resolve([]);
          }),
      );
      const event = {
        exception: {
          values: [],
        },
        message: 'foo',
      };
      const hint = {
        originalException: new Error('originalException'),
      };
      await linkedErrors.handler(event, hint);
      expect(spy.mock.calls.length).toEqual(1);
    });

    it('should recursively walk error to find linked exceptions and assign them to the event', async () => {
      const event = {
        exception: {
          values: [],
        },
        message: 'foo',
      };

      const one: ExtendedError = new Error('one');
      const two: ExtendedError = new TypeError('two');
      const three: ExtendedError = new SyntaxError('three');

      const originalException = one;
      one.cause = two;
      two.cause = three;

      const result = await linkedErrors.handler(event, {
        originalException,
      });

      // It shouldn't include root exception, as it's already processed in the event by the main error handler
      expect(result!.exception!.values!.length).toEqual(2);
      expect(result!.exception!.values![0].type).toEqual('TypeError');
      expect(result!.exception!.values![0].value).toEqual('two');
      expect(result!.exception!.values![0].stacktrace).toHaveProperty('frames');
      expect(result!.exception!.values![1].type).toEqual('SyntaxError');
      expect(result!.exception!.values![1].value).toEqual('three');
      expect(result!.exception!.values![1].stacktrace).toHaveProperty('frames');
    });

    it('should allow to change walk key', async () => {
      linkedErrors = new LinkedErrors({
        key: 'reason',
      });
      const event = {
        exception: {
          values: [],
        },
        message: 'foo',
      };

      const one: ExtendedError = new Error('one');
      const two: ExtendedError = new TypeError('two');
      const three: ExtendedError = new SyntaxError('three');

      const originalException = one;
      one.reason = two;
      two.reason = three;

      const result = await linkedErrors.handler(event, {
        originalException,
      });

      // It shouldn't include root exception, as it's already processed in the event by the main error handler
      expect(result!.exception!.values!.length).toEqual(2);
      expect(result!.exception!.values![0].type).toEqual('TypeError');
      expect(result!.exception!.values![0].value).toEqual('two');
      expect(result!.exception!.values![0].stacktrace).toHaveProperty('frames');
      expect(result!.exception!.values![1].type).toEqual('SyntaxError');
      expect(result!.exception!.values![1].value).toEqual('three');
      expect(result!.exception!.values![1].stacktrace).toHaveProperty('frames');
    });
  });
});
