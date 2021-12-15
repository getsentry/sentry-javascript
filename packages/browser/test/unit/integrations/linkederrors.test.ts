import { stub } from 'sinon';

import { LinkedErrors } from '../../../src/integrations/linkederrors';

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
      expect(spy.called).toBe(false);
      expect(result).toEqual(event);
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
      expect(spy.called).toBe(false);
      expect(result).toEqual(event);
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
      expect(spy.calledOnce).toBe(true);
    });
  });
});
