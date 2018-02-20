import { expect } from 'chai';

import * as Sentry from '@sentry/core';
import { SentryBrowser } from '../src/index';

describe('Test', () => {
  beforeEach(async () => {
    await Sentry.create('https://53039209a22b4ec1bcc296a3c9fdecd6@sentry.io/4291')
      .use(SentryBrowser)
      .install()
      .then(client => client.setContext({ extra: { abc: 'def' } }));
  });

  it('works', async () => {
    expect(await Sentry.getSharedClient().getContext()).to.deep.equal({ extra: { abc: 'def' } });
  });
});
