import { ExtendedError } from '@sentry/types';
import { createStackParser } from '@sentry/utils';

import { Event, NodeClient } from '../../src';
import { LinkedErrors } from '../../src/integrations/linkederrors';
import { nodeStackParser } from '../../src/stack-parser';
import { setupNodeTransport } from '../../src/transports';
import { getDefaultNodeClientOptions } from '../helper/node-client-options';

const stackParser = createStackParser(nodeStackParser);

let linkedErrors: any;

describe('LinkedErrors', () => {
  beforeEach(() => {
    linkedErrors = new LinkedErrors();
  });

  describe('handler', () => {
    it('should bail out if event doesnt contain exception', async () => {
      expect.assertions(2);
      const spy = jest.spyOn(linkedErrors, '_walkErrorTree');
      const event = {
        message: 'foo',
      };
      return linkedErrors._handler(stackParser, event).then((result: any) => {
        expect(spy.mock.calls.length).toEqual(0);
        expect(result).toEqual(event);
      });
    });

    it('should bail out if event contains exception, but no hint', async () => {
      expect.assertions(2);
      const spy = jest.spyOn(linkedErrors, '_walkErrorTree');
      const one = new Error('originalException');
      const options = getDefaultNodeClientOptions({ stackParser });
      const client = new NodeClient(options, setupNodeTransport(options).transport);
      let event: Event | undefined;
      return client
        .eventFromException(one)
        .then(eventFromException => {
          event = eventFromException;
          return linkedErrors._handler(stackParser, eventFromException);
        })
        .then(result => {
          expect(spy.mock.calls.length).toEqual(0);
          expect(result).toEqual(event);
        });
    });

    it('should call walkErrorTree if event contains exception and hint with originalException', async () => {
      expect.assertions(1);
      const spy = jest.spyOn(linkedErrors, '_walkErrorTree').mockImplementation(
        async () =>
          new Promise<[]>(resolve => {
            resolve([]);
          }),
      );
      const one = new Error('originalException');
      const options = getDefaultNodeClientOptions({ stackParser });
      const client = new NodeClient(options, setupNodeTransport(options).transport);
      return client.eventFromException(one).then(event =>
        linkedErrors
          ._handler(stackParser, event, {
            originalException: one,
          })
          .then((_: any) => {
            expect(spy.mock.calls.length).toEqual(1);
          }),
      );
    });

    it('should recursively walk error to find linked exceptions and assign them to the event', async () => {
      expect.assertions(10);
      const one: ExtendedError = new Error('one');
      const two: ExtendedError = new TypeError('two');
      const three: ExtendedError = new SyntaxError('three');
      one.cause = two;
      two.cause = three;

      const options = getDefaultNodeClientOptions({ stackParser });
      const client = new NodeClient(options, setupNodeTransport(options).transport);
      return client.eventFromException(one).then(event =>
        linkedErrors
          ._handler(stackParser, event, {
            originalException: one,
          })
          .then((result: any) => {
            expect(result.exception.values.length).toEqual(3);
            expect(result.exception.values[0].type).toEqual('SyntaxError');
            expect(result.exception.values[0].value).toEqual('three');
            expect(result.exception.values[0].stacktrace).toHaveProperty('frames');
            expect(result.exception.values[1].type).toEqual('TypeError');
            expect(result.exception.values[1].value).toEqual('two');
            expect(result.exception.values[1].stacktrace).toHaveProperty('frames');
            expect(result.exception.values[2].type).toEqual('Error');
            expect(result.exception.values[2].value).toEqual('one');
            expect(result.exception.values[2].stacktrace).toHaveProperty('frames');
          }),
      );
    });

    it('should allow to change walk key', async () => {
      expect.assertions(10);
      linkedErrors = new LinkedErrors({
        key: 'reason',
      });

      const one: ExtendedError = new Error('one');
      const two: ExtendedError = new TypeError('two');
      const three: ExtendedError = new SyntaxError('three');
      one.reason = two;
      two.reason = three;

      const options = getDefaultNodeClientOptions({ stackParser });
      const client = new NodeClient(options, setupNodeTransport(options).transport);
      return client.eventFromException(one).then(event =>
        linkedErrors
          ._handler(stackParser, event, {
            originalException: one,
          })
          .then((result: any) => {
            expect(result.exception.values.length).toEqual(3);
            expect(result.exception.values[0].type).toEqual('SyntaxError');
            expect(result.exception.values[0].value).toEqual('three');
            expect(result.exception.values[0].stacktrace).toHaveProperty('frames');
            expect(result.exception.values[1].type).toEqual('TypeError');
            expect(result.exception.values[1].value).toEqual('two');
            expect(result.exception.values[1].stacktrace).toHaveProperty('frames');
            expect(result.exception.values[2].type).toEqual('Error');
            expect(result.exception.values[2].value).toEqual('one');
            expect(result.exception.values[2].stacktrace).toHaveProperty('frames');
          }),
      );
    });

    it('should allow to change stack size limit', async () => {
      expect.assertions(7);
      linkedErrors = new LinkedErrors({
        limit: 2,
      });

      const one: ExtendedError = new Error('one');
      const two: ExtendedError = new TypeError('two');
      const three: ExtendedError = new SyntaxError('three');
      one.cause = two;
      two.cause = three;

      const options = getDefaultNodeClientOptions({ stackParser });
      const client = new NodeClient(options, setupNodeTransport(options).transport);
      return client.eventFromException(one).then(event =>
        linkedErrors
          ._handler(stackParser, event, {
            originalException: one,
          })
          .then((result: any) => {
            expect(result.exception.values.length).toEqual(2);
            expect(result.exception.values[0].type).toEqual('TypeError');
            expect(result.exception.values[0].value).toEqual('two');
            expect(result.exception.values[0].stacktrace).toHaveProperty('frames');
            expect(result.exception.values[1].type).toEqual('Error');
            expect(result.exception.values[1].value).toEqual('one');
            expect(result.exception.values[1].stacktrace).toHaveProperty('frames');
          }),
      );
    });
  });
});
