import { NodeBackend } from '../../src';
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
      const one = new Error('originalException');
      const backend = new NodeBackend({});
      const event = await backend.eventFromException(one);
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
      const one = new Error('originalException');
      const backend = new NodeBackend({});
      const event = await backend.eventFromException(one);
      await linkedErrors.handler(event, {
        originalException: one,
      });
      expect(spy.mock.calls.length).toEqual(1);
    });

    it('should recursively walk error to find linked exceptions and assign them to the event', async () => {
      const one: ExtendedError = new Error('one');
      const two: ExtendedError = new TypeError('two');
      const three: ExtendedError = new SyntaxError('three');
      one.cause = two;
      two.cause = three;

      const backend = new NodeBackend({});
      const event = await backend.eventFromException(one);
      const result = await linkedErrors.handler(event, {
        originalException: one,
      });

      expect(result!.exception!.values!.length).toEqual(3);
      expect(result!.exception!.values![0].type).toEqual('SyntaxError');
      expect(result!.exception!.values![0].value).toEqual('three');
      expect(result!.exception!.values![0].stacktrace).toHaveProperty('frames');
      expect(result!.exception!.values![1].type).toEqual('TypeError');
      expect(result!.exception!.values![1].value).toEqual('two');
      expect(result!.exception!.values![1].stacktrace).toHaveProperty('frames');
      expect(result!.exception!.values![2].type).toEqual('Error');
      expect(result!.exception!.values![2].value).toEqual('one');
      expect(result!.exception!.values![2].stacktrace).toHaveProperty('frames');
    });

    it('should allow to change walk key', async () => {
      linkedErrors = new LinkedErrors({
        key: 'reason',
      });

      const one: ExtendedError = new Error('one');
      const two: ExtendedError = new TypeError('two');
      const three: ExtendedError = new SyntaxError('three');
      one.reason = two;
      two.reason = three;

      const backend = new NodeBackend({});
      const event = await backend.eventFromException(one);
      const result = await linkedErrors.handler(event, {
        originalException: one,
      });

      expect(result!.exception!.values!.length).toEqual(3);
      expect(result!.exception!.values![0].type).toEqual('SyntaxError');
      expect(result!.exception!.values![0].value).toEqual('three');
      expect(result!.exception!.values![0].stacktrace).toHaveProperty('frames');
      expect(result!.exception!.values![1].type).toEqual('TypeError');
      expect(result!.exception!.values![1].value).toEqual('two');
      expect(result!.exception!.values![1].stacktrace).toHaveProperty('frames');
      expect(result!.exception!.values![2].type).toEqual('Error');
      expect(result!.exception!.values![2].value).toEqual('one');
      expect(result!.exception!.values![2].stacktrace).toHaveProperty('frames');
    });

    it('should allow to change stack size limit', async () => {
      linkedErrors = new LinkedErrors({
        limit: 2,
      });

      const one: ExtendedError = new Error('one');
      const two: ExtendedError = new TypeError('two');
      const three: ExtendedError = new SyntaxError('three');
      one.cause = two;
      two.cause = three;

      const backend = new NodeBackend({});
      const event = await backend.eventFromException(one);
      const result = await linkedErrors.handler(event, {
        originalException: one,
      });

      expect(result!.exception!.values!.length).toEqual(2);
      expect(result!.exception!.values![0].type).toEqual('TypeError');
      expect(result!.exception!.values![0].value).toEqual('two');
      expect(result!.exception!.values![0].stacktrace).toHaveProperty('frames');
      expect(result!.exception!.values![1].type).toEqual('Error');
      expect(result!.exception!.values![1].value).toEqual('one');
      expect(result!.exception!.values![1].stacktrace).toHaveProperty('frames');
    });
  });
});
