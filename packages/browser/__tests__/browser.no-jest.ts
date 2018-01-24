import * as Sentry from '@sentry/core';
import { SentryBrowser } from '../lib/SentryBrowser';

// install() returns a promise after init
Sentry.create('https://53039209a22b4ec1bcc296a3c9fdecd6@sentry.io/4291')
  .use(SentryBrowser)
  .install()
  .then(client => {
    client.setTagsContext({ cordova: true });
    client.captureBreadcrumb({ message: 'HOHOHOHO' });
  });

// This should also work because we internally await for adapter install
Sentry.getSharedClient().captureMessage('PICKLE RIIIICK!');
Sentry.getSharedClient().captureException(new Error('YOYOYOY'));

// throw new Error('YP Test');
