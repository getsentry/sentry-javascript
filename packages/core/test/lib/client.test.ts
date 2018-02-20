import { expect } from 'chai';
import { spy } from 'sinon';
import { MockAdapter } from '../mocks/MockAdapter';
import * as Sentry from '../../src/index';

const dsn = 'https://username:password@domain/path';

describe('Sentry.Client', () => {
  it('get public/private DSN', () => {
    const sentry = new Sentry.Client(dsn);
    expect(sentry.dsn.getDSN()).to.equal('https://username@domain/path');
    expect(sentry.dsn.getDSN(true)).to.equal(dsn);
    const sentry2 = new Sentry.Client(
      'https://username:password@domain:8888/path',
    );
    expect(sentry2.dsn.getDSN()).to.equal('https://username@domain:8888/path');
    expect(sentry2.dsn.getDSN(true)).to.equal(
      'https://username:password@domain:8888/path',
    );
  });

  it('invalid DSN', () => {
    expect(() => {
      new Sentry.Client('abc');
    }).to.throw();
    expect(() => {
      new Sentry.Client('https://username:password@domain');
    }).to.throw();
    expect(() => {
      new Sentry.Client('//username:password@domain');
    }).to.throw();
    expect(() => {
      new Sentry.Client('https://username:@domain');
    }).to.throw();
    expect(() => {
      new Sentry.Client('123');
    }).to.throw();
    try {
      new Sentry.Client('123');
    } catch (e) {
      expect(e instanceof Sentry.SentryError).to.be.ok;
    }
  });

  it('throw error if multiple Adapters', () => {
    const sentry = Sentry.create(dsn);
    expect(Sentry.getSharedClient()).to.equal(sentry);
    sentry.use(MockAdapter);
    expect(() => sentry.use(MockAdapter)).to.throw();
  });

  it('call install on Adapter', async () => {
    const sentry = new Sentry.Client(dsn);
    sentry.use(MockAdapter, { testOption: true });
    const spy1 = spy(sentry, 'install');
    const spy2 = spy(sentry.getAdapter(), 'install');
    await sentry.install();
    expect(spy1.calledOnce).to.be.true;
    expect(spy2.calledOnce).to.be.true;
  });

  it('multiple install calls on Adapter should only call once', async () => {
    const sentry = new Sentry.Client(dsn);
    sentry.use(MockAdapter, { testOption: true });
    const spy1 = spy(sentry.getAdapter(), 'install');
    await sentry.install();
    await sentry.install();
    expect(spy1.calledOnce).to.be.true;
  });

  it('no registered Adapter', async () => {
    const sentry = new Sentry.Client(dsn);
    try {
      await sentry.install();
    } catch (e) {
      expect(e.message).to.equal(
        'No adapter in use, please call .use(<Adapter>)',
      );
    }
  });

  it('get Adapter', () => {
    const sentry = new Sentry.Client(dsn);
    sentry.use(MockAdapter, { testOption: true });
    expect(sentry.getAdapter()).to.be.an.instanceof(MockAdapter);
  });

  it('call captureMessage with reject on Adapter', async () => {
    const sentry = await new Sentry.Client(dsn).use(MockAdapter).install();
    try {
      await sentry.captureMessage('fail');
    } catch (e) {
      expect(e.message).to.equal('Failed because we told it to');
    }
  });

  it('call captureMessage on Adapter', async () => {
    const sentry = new Sentry.Client(dsn).use(MockAdapter);
    sentry.install();
    const spy1 = spy(sentry, 'captureMessage');
    const spy2 = spy(sentry.getAdapter(), 'captureMessage');
    const result = await sentry.captureMessage('heyho');
    expect(spy1.calledOnce).to.be.true;
    expect(spy2.calledOnce).to.be.true;
    expect(result).to.be.ok;
    if (result) {
      expect(result.message).to.equal('heyho');
    }
  });

  it('call captureBreadcrumb on Adapter', async () => {
    const sentry = new Sentry.Client(dsn).use(MockAdapter);
    await sentry.install();
    const spy1 = spy(sentry, 'captureBreadcrumb');
    const spy2 = spy(sentry.getAdapter(), 'captureBreadcrumb');
    await sentry.captureBreadcrumb({ category: 'test' });
    expect(spy1.calledOnce).to.be.true;
    expect(spy2.calledOnce).to.be.true;
  });

  it('call captureException on Adapter', async () => {
    const sentry = await new Sentry.Client(dsn).use(MockAdapter).install();
    const spy1 = spy(sentry, 'captureException');
    const spy2 = spy(sentry.getAdapter(), 'captureException');
    await sentry.captureException(new Error('oops'));
    expect(spy1.calledOnce).to.be.true;
    expect(spy2.calledOnce).to.be.true;
  });

  it('call send only on one Adapter', async () => {
    const sentry = await new Sentry.Client(dsn).use(MockAdapter).install();
    const spy1 = spy(sentry, 'captureMessage');
    const spy2 = spy(sentry.getAdapter(), 'captureMessage');
    const spySend = spy(sentry, 'send');
    const spySend2 = spy(sentry.getAdapter(), 'send');
    const result = await sentry.captureMessage('+');
    expect(spy1.calledOnce).to.be.true;
    expect(spy2.calledOnce).to.be.true;
    expect(spySend.calledOnce).to.be.true;
    expect(spySend2.calledOnce).to.be.true;
    expect(result).to.be.ok;
    if (result) {
      expect(result.message).to.equal('+');
    }
  });

  it('call log only if bigger debug', () => {
    const sentry = new Sentry.Client(dsn).use(MockAdapter);
    const spy1 = spy(global.console, 'log');
    sentry.log('Nothing');
    expect(spy1.calledOnce).to.be.false;
    sentry.options.logLevel = Sentry.LogLevel.Debug;
    sentry.log('This is fine');
    expect(spy1.calledOnce).to.be.true;
  });

  it('should throw error without calling install', async () => {
    const sentry = new Sentry.Client(dsn).use(MockAdapter);
    return sentry.captureException(new Error('oops')).catch(err => {
      expect(err).to.be.instanceof(Sentry.SentryError);
      expect(err.message).to.equal(
        'Please call install() before calling other methods on Sentry',
      );
    });
  });

  it('call setOptions on Adapter', async () => {
    const sentry = await new Sentry.Client(dsn).use(MockAdapter).install();
    const spy1 = spy(sentry.getAdapter(), 'setOptions');
    await sentry.setOptions({ release: '#oops' });
    expect(spy1.calledOnce).to.be.true;
  });

  it('setContext', async () => {
    const sentry = await new Sentry.Client(dsn).use(MockAdapter).install();
    sentry.setContext({
      extra: {
        some: 'key',
      },
      tags: ['test1', 'test2'],
    });
    expect(await sentry.getContext()).to.deep.equal({
      extra: {
        some: 'key',
      },
      tags: ['test1', 'test2'],
    });
  });
});
