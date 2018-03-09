import { expect } from 'chai';
import { SentryClient } from '../src';

const TEST_DSN = 'https://53039209a22b4ec1bcc296a3c9fdecd6@sentry.io/4291';

describe('Test', () => {
  beforeEach(async () => {
    await SentryClient.create({ dsn: TEST_DSN });
    await SentryClient.setContext({ extra: { abc: 'def' } });
  });

  it('works', async () => {
    const context = await SentryClient.getContext();
    expect(context).to.deep.equal({ extra: { abc: 'def' } });
  });
});
