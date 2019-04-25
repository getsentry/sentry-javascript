import { ExtendedError } from '@sentry/types';
import { expect } from 'chai';
import { stub } from 'sinon';

import { BrowserBackend } from '../../src/backend';
import { LinkedErrors } from '../../src/integrations/linkederrors';

let linkedErrors: any;

describe('LinkedErrors', () => {
  beforeEach(() => {
    linkedErrors = new LinkedErrors();
  });

  describe('handler', () => {
    it('should bail out if event doesnt contain exception', () => {
      const spy = stub(linkedErrors, '_walkErrorTree');
      const event = {
        message: 'foo',
      };
      const result = linkedErrors._handler(event);
      expect(spy.called).equal(false);
      expect(result).to.deep.equal(event);
    });

    it('should bail out if event contains exception, but no hint', () => {
      const spy = stub(linkedErrors, '_walkErrorTree');
      const event = {
        exception: {
          values: [],
        },
        message: 'foo',
      };
      const result = linkedErrors._handler(event);
      expect(spy.called).equal(false);
      expect(result).to.deep.equal(event);
    });

    it('should call walkErrorTree if event contains exception and hint with originalException', () => {
      const spy = stub(linkedErrors, '_walkErrorTree').callsFake(() => []);
      const event = {
        exception: {
          values: [],
        },
        message: 'foo',
      };
      const hint = {
        originalException: new Error('originalException'),
      };
      linkedErrors._handler(event, hint);
      expect(spy.calledOnce).equal(true);
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
        const result = linkedErrors._handler(event, {
          originalException,
        });

        // It shouldn't include root exception, as it's already processed in the event by the main error handler
        expect(result.exception.values.length).equal(3);
        expect(result.exception.values[0].type).equal('SyntaxError');
        expect(result.exception.values[0].value).equal('three');
        expect(result.exception.values[0].stacktrace).to.have.property('frames');
        expect(result.exception.values[1].type).equal('TypeError');
        expect(result.exception.values[1].value).equal('two');
        expect(result.exception.values[1].stacktrace).to.have.property('frames');
        expect(result.exception.values[2].type).equal('Error');
        expect(result.exception.values[2].value).equal('one');
        expect(result.exception.values[2].stacktrace).to.have.property('frames');
      });
    });

    it('should allow to change walk key', async () => {
      linkedErrors = new LinkedErrors({
        key: 'reason',
      });

      const three: ExtendedError = new SyntaxError('three');

      const two: ExtendedError = new TypeError('two');
      two.reason = three;

      const one: ExtendedError = new Error('one');
      one.reason = two;

      const originalException = one;
      const backend = new BrowserBackend({});
      return backend.eventFromException(originalException).then(event => {
        const result = linkedErrors._handler(event, {
          originalException,
        });

        expect(result.exception.values.length).equal(3);
        expect(result.exception.values[0].type).equal('SyntaxError');
        expect(result.exception.values[0].value).equal('three');
        expect(result.exception.values[0].stacktrace).to.have.property('frames');
        expect(result.exception.values[1].type).equal('TypeError');
        expect(result.exception.values[1].value).equal('two');
        expect(result.exception.values[1].stacktrace).to.have.property('frames');
        expect(result.exception.values[2].type).equal('Error');
        expect(result.exception.values[2].value).equal('one');
        expect(result.exception.values[2].stacktrace).to.have.property('frames');
      });
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

      const backend = new BrowserBackend({});
      return backend.eventFromException(one).then(event => {
        const result = linkedErrors._handler(event, {
          originalException: one,
        });

        expect(result.exception.values.length).equal(2);
        expect(result.exception.values[0].type).equal('TypeError');
        expect(result.exception.values[0].value).equal('two');
        expect(result.exception.values[0].stacktrace).to.have.property('frames');
        expect(result.exception.values[1].type).equal('Error');
        expect(result.exception.values[1].value).equal('one');
        expect(result.exception.values[1].stacktrace).to.have.property('frames');
      });
    });
  });
});
