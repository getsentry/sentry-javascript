import {expect} from 'chai';
import {spy} from 'sinon';
import {MockAdapter} from '../__mocks__/MockAdapter';
import * as Sentry from '../src/index';

const dsn = 'https://username:password@domain/path';

describe('Sentry.Client context', () => {
  it('set context', async () => {
    const sentry = new Sentry.Client(dsn);
    const adapter = await sentry.use(MockAdapter).install();
    const spy1 = spy(adapter, 'setContext');
    await sentry.setContext({tags: [12]});
    expect(sentry.getContext()).to.deep.equal({tags: [12]});
    expect(spy1.calledOnce).to.be.true;
  });
});
