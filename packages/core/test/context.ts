import {expect} from 'chai';
import {spy} from 'sinon';
import {MockAdapter} from '../__mocks__/MockAdapter';
import * as Sentry from '../src/index';

const dsn = 'https://username:password@domain/path';

describe('Sentry.Client context', () => {
  it('set tags', async () => {
    const sentry = new Sentry.Client(dsn);
    const adapter = await sentry.use(MockAdapter).install();
    const spy1 = spy(adapter, 'setTagsContext');
    await sentry.setTagsContext({yo: 12});
    expect(sentry.getContext()).to.deep.equal({tags: {yo: 12}});
    expect(spy1.calledOnce).to.be.true;
  });

  it('set extra and tags', async () => {
    const sentry = new Sentry.Client(dsn);
    const adapter = await sentry.use(MockAdapter).install();
    const spy1 = spy(adapter, 'setExtraContext');
    await sentry.setTagsContext({yo: 12});
    expect(sentry.getContext()).to.deep.equal({tags: {yo: 12}});
    await sentry.setExtraContext({foo: 13});
    expect(sentry.getContext()).to.deep.equal({tags: {yo: 12}, extra: {foo: 13}});
    expect(spy1.calledOnce).to.be.true;
  });

  it('clear context', async () => {
    const sentry = new Sentry.Client(dsn);
    const adapter = await sentry.use(MockAdapter).install();
    const spy1 = spy(adapter, 'clearContext');
    await sentry.setTagsContext({yo: 12});
    expect(sentry.getContext()).to.deep.equal({tags: {yo: 12}});
    await sentry.clearContext();
    expect(sentry.getContext()).to.deep.equal({});
    expect(spy1.calledOnce).to.be.true;
  });

  it('set undefined', async () => {
    const sentry = new Sentry.Client(dsn);
    const adapter = await sentry.use(MockAdapter).install();
    await sentry.setTagsContext(undefined);
    expect(sentry.getContext()).to.deep.equal({});
    await sentry.setTagsContext({yo: 12});
    expect(sentry.getContext()).to.deep.equal({tags: {yo: 12}});
    await sentry.setTagsContext(undefined);
    expect(sentry.getContext()).to.deep.equal({});
    await sentry.setExtraContext(undefined);
    expect(sentry.getContext()).to.deep.equal({});
    await sentry.clearContext();
    expect(sentry.getContext()).to.deep.equal({});
  });

  it('set user', async () => {
    const sentry = new Sentry.Client(dsn);
    const adapter = await sentry.use(MockAdapter).install();
    await sentry.setUserContext({
      id: 'it',
    });
    expect(sentry.getContext()).to.deep.equal({user: {id: 'it'}});
    await sentry.clearContext();
    expect(sentry.getContext()).to.deep.equal({});
  });
});
