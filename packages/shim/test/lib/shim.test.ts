import { expect } from 'chai';
import { spy } from 'sinon';
import {
  _callOnClient,
  addBreadcrumb,
  captureEvent,
  captureException,
  captureMessage,
  clearScope,
  popScope,
  pushScope,
  setExtraContext,
  setTagsContext,
  setUserContext,
  withScope,
} from '../../src/index';
import { create, TestClient, TestClient2 } from '../mocks/client';

declare var global: any;

describe('Shim', () => {
  beforeEach(() => {
    global.__SENTRY__ = {
      processStack: [],
      shim: undefined,
    };
  });

  it('should capture an exception', () => {
    const client = {
      captureException: spy(),
    };
    withScope(client, () => {
      const e = new Error('test exception');
      captureException(e);
      expect(client.captureException.getCall(0).args[0]).to.equal(e);
    });
  });

  it('should capture a message', () => {
    const client = {
      captureMessage: spy(),
    };
    withScope(client, () => {
      const message = 'yo';
      captureMessage(message);
      expect(client.captureMessage.getCall(0).args[0]).to.equal(message);
    });
  });

  it('should capture an event', () => {
    const client = {
      captureEvent: spy(),
    };
    withScope(client, () => {
      const e = { message: 'test' };
      captureEvent(e);
      expect(client.captureEvent.getCall(0).args[0]).to.equal(e);
    });
  });

  it('should set user context', () => {
    const client = {
      setContext: spy(),
    };
    pushScope(client);
    setUserContext({ id: '1234' });
    expect(client.setContext.getCall(0).args[0]).to.deep.equal({
      user: { id: '1234' },
    });
    popScope();
  });

  it('should set extra context', () => {
    const client = {
      setContext: spy(),
    };
    pushScope(client);
    setExtraContext({ id: '1234' });
    expect(client.setContext.getCall(0).args[0]).to.deep.equal({
      extra: { id: '1234' },
    });
    popScope();
  });

  it('should set tags context', () => {
    const client = {
      setContext: spy(),
    };
    pushScope(client);
    setTagsContext({ id: '1234' });
    expect(client.setContext.getCall(0).args[0]).to.deep.equal({
      tags: { id: '1234' },
    });
    popScope();
  });

  it('should clears scope', () => {
    const client = {
      getInitialScope: () => ({ context: {} }),
      setContext: (nextContext: any, scope: any) => {
        const sc = scope.context;
        sc.user = { ...nextContext.user };
      },
    };
    withScope(client, () => {
      setUserContext({ id: '1234' });
      expect(global.__SENTRY__.processStack[1].scope).to.deep.equal({
        context: { user: { id: '1234' } },
      });
      clearScope();
      expect(global.__SENTRY__.processStack[1].scope).to.deep.equal({
        context: {},
      });
    });
  });

  it('should add a breadcrumb', () => {
    const client = {
      addBreadcrumb: spy(),
    };
    pushScope(client);
    addBreadcrumb({ message: 'world' });
    expect(client.addBreadcrumb.getCall(0).args[0]).to.deep.equal({
      message: 'world',
    });
    popScope();
  });

  it('should call function on client', done => {
    const s = spy(TestClient.prototype, 'mySecretPublicMethod');
    withScope(new TestClient({}), () => {
      _callOnClient('mySecretPublicMethod', 'test');
      expect(s.getCall(0).args[0]).to.equal('test');
      s.restore();
      done();
    });
  });

  it('should throw an error when pushing different clients', () => {
    create({});
    expect(() => {
      withScope(new TestClient2(), () => {
        //
      });
    }).to.throw();
  });

  it('should not throw an error when pushing same clients', () => {
    create({});
    expect(() => {
      withScope(new TestClient({}), () => {
        //
      });
    }).to.not.throw();
  });
});
