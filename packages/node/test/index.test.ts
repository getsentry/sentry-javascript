import { expect } from 'chai';
import { SentryClient } from '../src';

const TEST_DSN = 'https://53039209a22b4ec1bcc296a3c9fdecd6@sentry.io/4291';

describe('SentryNode', () => {
  beforeEach(async () => {
    await SentryClient.create({ dsn: TEST_DSN });
  });

  describe('getContext() / setContext()', () => {
    it('should store/load extra', async () => {
      await SentryClient.setContext({ extra: { abc: { def: [1] } } });
      const context = await SentryClient.getContext();
      expect(context).to.deep.equal({ extra: { abc: { def: [1] } } });
    });

    it('should store/load tags', async () => {
      await SentryClient.setContext({ tags: { abc: 'def' } });
      const context = await SentryClient.getContext();
      expect(context).to.deep.equal({ tags: { abc: 'def' } });
    });

    it('should store/load user', async () => {
      await SentryClient.setContext({ user: { id: 'def' } });
      const context = await SentryClient.getContext();
      expect(context).to.deep.equal({ user: { id: 'def' } });
    });
  });

  describe('breadcrumbs', () => {
    it('should store breadcrumbs', async () => {
      await SentryClient.create({ dsn: TEST_DSN });
      await SentryClient.addBreadcrumb({ message: 'test' });
    });
  });
});
